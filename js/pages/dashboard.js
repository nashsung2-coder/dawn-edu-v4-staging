/* 主控台 v2：小曙對話優先 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile, md } from "../core/ui.js";
import { buildLearningContext, companionChat, companionGreeting } from "../core/companion.js";
import { getRecentHistory, renderHistoryList } from "../core/learn-history.js";

const $ = id => document.getElementById(id);
let learningContext = "";
let chatHistory = [];
let nickname = "同學";
let userMemory = "";
let chatSummary = ""; // 舊對話的壓縮摘要

async function maybeCompressHistory() {
  if (chatHistory.length <= 30) return;
  try {
    const { ask } = await import("../core/llm.js");
    const oldPart = chatHistory.slice(0, -20);
    const text = oldPart.map(m => `${m.role === "user" ? "用戶" : "小曙"}: ${m.content.slice(0, 200)}`).join("\n");
    const summary = await ask(
      "你是對話摘要助手。用繁體中文，把以下對話壓縮成 150 字內的摘要，保留關鍵主題和結論。",
      text,
      { model: "fast" }
    );
    chatSummary = (chatSummary ? chatSummary + "\n" : "") + summary.trim();
    chatHistory = chatHistory.slice(-20);
    saveChatHistory();
  } catch {}
}

function addMsg(role, text) {
  const box = $("cp-msgs");
  box.style.display = "flex";
  const div = document.createElement("div");
  div.className = `cp-msg ${role}`;
  // 檢查是否有 [HTML]...[/HTML] 標記
  let htmlMatch = text.match(/\[HTML\]([\s\S]*?)\[\/HTML\]/);
  // 容錯：只有 [HTML] 開標籤沒有閉標籤時，也嘗試渲染
  if (!htmlMatch && role === "ai" && text.includes("[HTML]")) {
    const idx = text.indexOf("[HTML]") + 6;
    htmlMatch = [text.slice(idx - 6), text.slice(idx).trim()];
  }
  if (htmlMatch && role === "ai") {
    // 渲染 HTML 到 sandboxed iframe（只顯示渲染結果，不顯示原始碼）
    const htmlContent = htmlMatch[1].trim();
    // textBefore 只取 [HTML] 之前的文字，不包含原始碼
    const htmlStart = text.indexOf("[HTML]");
    const textBefore = (htmlStart > 0 ? text.slice(0, htmlStart) : "").trim();
    let inner = "";
    if (textBefore) inner += `<div style="margin-bottom:8px;">${esc(textBefore).replace(/\n/g, "<br>")}</div>`;
    inner += `<iframe sandbox="allow-same-origin" style="width:100%;min-height:300px;border:1px solid oklch(1 0 0 / 0.1);border-radius:12px;background:#1a1a2e;" srcdoc="${esc(htmlContent)}"></iframe>`;
    div.innerHTML = inner;
  } else {
    div.innerHTML = md(text);
  }
  // AI 訊息加 HTML 解釋按鈕（避免重複）
  if (role === "ai" && !htmlMatch && !div.querySelector(".html-explain-btn")) {
    const btn = document.createElement("button");
    btn.className = "html-explain-btn";
    btn.textContent = "HTML 圖解";
    btn.style.cssText = "margin-top:8px;font-size:11px;padding:4px 10px;border-radius:12px;border:1px solid oklch(1 0 0 / 0.15);background:transparent;color:var(--brass-300);cursor:pointer;";
    btn.onclick = () => requestHtmlExplain(text);
    div.appendChild(btn);
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// 請求 AI 用 HTML 重新解釋
async function requestHtmlExplain(originalText) {
  showTyping();
  try {
    const { ask } = await import("../core/llm.js");
    const cleanText = originalText.replace(/\[TOOL:[^\]]+\]/g, "").trim();
    const system = "你是一位擅長視覺化解釋的老師。用繁體中文思考。";
    const prompt = `把以下內容做成一頁 HTML 圖解（可用表格、流程、比較表、時間線）。只用 HTML+CSS inline style，深色背景適配，不要 script，不要 markdown。\n\n內容：\n${cleanText}\n\n只輸出 [HTML]...[/HTML] 包住的 HTML，不要其他文字。`;
    const reply = await ask(system, prompt, { model: "fast" });
    document.getElementById("cp-typing")?.remove();
    // 確保有 [HTML] 標記，沒有的話直接包起來
    let final = reply;
    if (!reply.includes("[HTML]")) {
      final = `[HTML]<div style="padding:24px;line-height:1.9;font-size:15px;">${md(reply)}</div>[/HTML]`;
    }
    addMsg("ai", final);
    try { chatHistory.push({ role: "assistant", content: final }); saveChatHistory(); } catch {}
  } catch (e) {
    document.getElementById("cp-typing")?.remove();
    addMsg("ai", "HTML 生成失敗，再試一次好嗎？");
  }
}

function showTyping() {
  const box = $("cp-msgs");
  box.style.display = "flex";
  const div = document.createElement("div");
  div.className = "cp-msg ai"; div.id = "cp-typing";
  div.innerHTML = `<span class="typing"><span>●</span><span>●</span><span>●</span></span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function hideTyping() { $("cp-typing")?.remove(); }

async function send(text) {
  if (!text.trim() || $("cp-send").disabled) return;
  $("cp-input").value = "";
  addMsg("user", text);
  chatHistory.push({ role: "user", content: text });
  saveChatHistory();
  showTyping();
  $("cp-send").disabled = true;
  // 安全超時：90 秒強制清除轉圈
  const safetyTimer = setTimeout(() => {
    hideTyping();
    $("cp-send").disabled = false;
    addMsg("ai", "抱歉，我剛才想太久了，再說一次好嗎？");
  }, 90000);
  try {
    await maybeCompressHistory();
    // 把摘要放在最前面，讓 AI 記得之前的對話
    const recentHistory = chatSummary
      ? [{ role: "user", content: `[先前對話摘要]\n${chatSummary}` }, ...chatHistory.slice(-24)]
      : chatHistory.slice(-24);
    const reply = await companionChat(recentHistory, learningContext, null, nickname, userMemory);
    clearTimeout(safetyTimer);
    // 記錄到學習歷程
    try {
      const { logLearnHistory, refreshHistoryUI } = await import("../core/learn-history.js");
      await logLearnHistory(supabase, user.id, {
        type: "小曙對話",
        topic: text.slice(0, 50),
        detail: reply.slice(0, 200),
      });
        await refreshHistoryUI(supabase, user.id);
  } catch {}
    hideTyping();
    addMsg("ai", reply);
    chatHistory.push({ role: "assistant", content: reply });
    saveChatHistory();
  } catch (e) {
    clearTimeout(safetyTimer);
    hideTyping();
    console.error("小曙回應失敗:", e);
    addMsg("ai", `抱歉，我剛才恍神了（${e.message || "連線問題"}），再說一次好嗎？`);
  }
  $("cp-send").disabled = false;
}

// 對話紀錄存 localStorage
function saveChatHistory() {
  try {
    const key = `xiaoshu_chat_${window._uid || "anon"}`;
    // 只保留最近 50 輪，避免爆掉
    const trimmed = chatHistory.slice(-50);
    localStorage.setItem(key, JSON.stringify(trimmed));
    if (chatSummary) localStorage.setItem(key + "_summary", chatSummary);
  } catch {}
}
function clearChatHistory() {
  try {
    const key = `xiaoshu_chat_${window._uid || "anon"}`;
    localStorage.removeItem(key);
    chatHistory = [];
    document.getElementById("cp-msgs").innerHTML = "";
    toast("已清除對話紀錄");
  } catch {}
}
function loadChatHistory() {
  try {
    const key = `xiaoshu_chat_${window._uid || "anon"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      chatHistory = JSON.parse(saved);
      chatSummary = localStorage.getItem(key + "_summary") || "";
      // 恢復顯示（最多顯示最近 20 條）
      chatHistory.slice(-20).forEach(m => {
        if (m.role === "user" || m.role === "assistant") {
          addMsg(m.role === "user" ? "user" : "ai", m.content.replace(/\[TOOL:[^\]]+\]/g, "").trim() || m.content);
        }
      });
      return true;
    }
  } catch {}
  return false;
}

/* 新用戶 1 分鐘 aha 體驗：天空為什麼是藍的 */
async function startAha() {
  $("cp-suggest").innerHTML = "";
  $("cp-greeting").style.display = "none";
  addMsg("ai", "好！來玩個小遊戲。我問你：你覺得天空為什麼是藍的？");
  // 在歷史中加入引導，讓 AI 知道這是 aha 體驗，用蘇格拉底方式追問 2-3 輪
  chatHistory.push({ role: "assistant", content: "好！來玩個小遊戲。我問你：你覺得天空為什麼是藍的？（這是新用戶的 aha 體驗：接下來用 2-3 輪情境問題讓他發現自己其實沒完全想通，最後點出「你看，你以為你懂，但中間有個洞，這就是小曙的學習方式」）" });
  saveChatHistory();
}

async function init() {
  try {
    await renderTopbar("dashboard.html");
    const user = await requireAuth();
    await ensureProfile(supabase, user);

    // 建立學習 context
    learningContext = await buildLearningContext(supabase, user.id);
    window._uid = user.id;

    // 讀取暱稱和記憶
    try {
      const { data: prof } = await supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
      if (prof?.nickname) nickname = prof.nickname;
    } catch {}
    try {
      userMemory = localStorage.getItem(`xiaoshu_memory_${user.id}`) || "";
    } catch {}

    // 載入對話紀錄
    const hasHistory = loadChatHistory();

    // 先查數據（修 TDZ：review/nodes 必須先宣告才能用）
    const now0 = new Date().toISOString();
    const [review0, nodes0] = await Promise.all([
      supabase.from("review_cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("next_review_at", now0),
      supabase.from("knowledge_nodes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    // 檢測是否為新用戶（無任何學習數據）
    const isNewUser = (review0.count ?? 0) === 0 && (nodes0.count ?? 0) === 0;

    // 小曙主動打招呼（有對話紀錄就不用重新引導）
    if (isNewUser && !hasHistory) {
      $("cp-greeting").innerHTML = `嗨，我是小曙，你的學習陪伴者！<br><br>我跟其他 AI 不一樣——我不會直接給你答案，而是用問題帶你自己想通。<br><br>要不要體驗 1 分鐘看看？👇`;
      $("cp-suggest").innerHTML = `<button class="chip" id="cp-aha">✨ 體驗 1 分鐘</button><button class="chip">先逛逛就好</button>`;
      $("cp-suggest").querySelector("#cp-aha").onclick = startAha;
      $("cp-suggest").querySelectorAll(".chip")[1].onclick = () => {
        $("cp-suggest").innerHTML = "";
        $("cp-greeting").textContent = "沒問題！想學什麼的時候跟我說，我都在。";
      };
    } else {
      try {
        const greet = await companionGreeting(learningContext, nickname);
        $("cp-greeting").textContent = greet;
      } catch {
        $("cp-greeting").textContent = `今天想學點什麼？${nickname}，我陪你！`;
      }
    }

    // 建議快捷問題（新用戶走 aha 流程，不覆蓋）
    if (!(isNewUser && !hasHistory)) {
      const suggests = ["我今天該複習什麼？", "推薦一個知識庫給我", "幫我安排這週的學習計畫"];
      $("cp-suggest").innerHTML = suggests.map(s => `<button class="chip">${esc(s)}</button>`).join("");
      $("cp-suggest").querySelectorAll(".chip").forEach(x => x.onclick = () => send(x.textContent));
    }

    // 學習統計（review/nodes 已在上方查過，只查 profile）
    const [profile] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    const review = review0, nodes = nodes0;
    $("cp-stats").innerHTML = `
      <div class="stat"><div class="num">${review.count ?? 0}</div><div class="lbl">到期複習</div></div>
      <div class="stat"><div class="num">${nodes.count ?? 0}</div><div class="lbl">知識節點</div></div>
      <div class="stat"><div class="num">${profile.data?.streak_days ?? 0}</div><div class="lbl">連續天數</div></div>`;

    // 今日學習目標（從 localStorage 讀月目標拆解）
    try {
      const goalPlan = JSON.parse(localStorage.getItem(`goal_plan_${user.id}`) || "null");
      if (goalPlan?.weeks?.length) {
        const today = new Date().toISOString().slice(0, 10);
        const todayGoal = localStorage.getItem(`daily_goal_${user.id}_${today}`);
        $("cp-goals-list").innerHTML = todayGoal
          ? `<div style="color:var(--paper-200);">${esc(todayGoal)}</div>`
          : `<div style="color:var(--paper-400);">今日還沒設定目標，跟小曙聊聊讓他幫你安排吧</div>`;
      } else {
        $("cp-goals-list").innerHTML = `<div style="color:var(--paper-400);">還沒設定學習目標，在下方跟小曙說「幫我規劃這個月」</div>`;
      }
    } catch {
      $("cp-goals-list").innerHTML = `<div style="color:var(--paper-400);">載入失敗</div>`;
    }

    // AI 學習建議（基於到期複習和知識節點）
    try {
      const dueCount = review.count ?? 0;
      const nodeCount = nodes.count ?? 0;
      let suggest = "";
      if (dueCount > 0) suggest += `<div style="margin-bottom:8px;">📝 有 ${dueCount} 張卡片到期了，先去複習吧</div>`;
      if (nodeCount < 5) suggest += `<div style="margin-bottom:8px;">📚 知識庫只有 ${nodeCount} 個節點，去建立你的第一個知識庫吧</div>`;
      else suggest += `<div style="margin-bottom:8px;">📚 你有 ${nodeCount} 個知識節點，試試用情境學習來體驗它們</div>`;
      suggest += `<div style="font-size:12px;color:var(--paper-400);margin-top:8px;">跟小曙聊聊，他會給你更個人化的建議</div>`;
      $("cp-suggestions-list").innerHTML = suggest;
    } catch {
      $("cp-suggestions-list").innerHTML = `<div style="color:var(--paper-400);">載入失敗</div>`;
    }

    // 近 5 天學習紀錄
    try {
      const hist = await getRecentHistory(supabase, user.id, 5);
      document.getElementById("cp-history").innerHTML = renderHistoryList(hist);
    } catch {}
    // 複習建議
    try {
      const dueCount = review.count ?? 0;
      $("cp-review-desc").textContent = dueCount > 0 ? `有 ${dueCount} 張卡片等你複習` : "目前沒有到期卡片，繼續累積吧";
    } catch {}

    // 快捷入口
    const links = [
      ["socratic.html", "蘇格拉底對話"], ["review.html", "複習"], ["knowledge.html", "知識庫"],
      ["feynman.html", "費曼"], ["quiz.html", "對戰"], ["universe.html", "宇宙"],
      ["island.html", "群島"], ["pet.html", "靈獸"],
    ];
    $("cp-links").innerHTML = links.map(([h, t]) => `<a class="btn btn-ghost btn-sm" href="${h}" style="justify-content:center;">${t}</a>`).join("");

    // 綁定發送
    $("cp-send").onclick = () => send($("cp-input").value);
    $("cp-input").addEventListener("keydown", e => { if (e.key === "Enter") send($("cp-input").value); });

  } catch (e) {
    console.error("主控台載入失敗:", e);
    $("cp-greeting").innerHTML = `<span style="color:var(--signal-red);">載入失敗：${esc(e.message)}</span>`;
  }
}

init();
