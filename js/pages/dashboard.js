/* 主控台 v2：小曙對話優先 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile } from "../core/ui.js";
import { buildLearningContext, companionChat, companionGreeting } from "../core/companion.js";

const $ = id => document.getElementById(id);
let learningContext = "";
let chatHistory = [];

function addMsg(role, text) {
  const box = $("cp-msgs");
  box.style.display = "flex";
  const div = document.createElement("div");
  div.className = `cp-msg ${role}`;
  div.innerHTML = esc(text).replace(/\n/g, "<br>");
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
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
  showTyping();
  $("cp-send").disabled = true;
  try {
    const reply = await companionChat(chatHistory, learningContext);
    hideTyping();
    addMsg("ai", reply);
    chatHistory.push({ role: "assistant", content: reply });
  } catch (e) {
    hideTyping();
    console.error("小曙回應失敗:", e);
    addMsg("ai", `抱歉，我剛才恍神了（${e.message || "連線問題"}），再說一次好嗎？`);
  }
  $("cp-send").disabled = false;
}

/* 新用戶 1 分鐘 aha 體驗：天空為什麼是藍的 */
async function startAha() {
  $("cp-suggest").innerHTML = "";
  $("cp-greeting").style.display = "none";
  addMsg("ai", "好！來玩個小遊戲。我問你：你覺得天空為什麼是藍的？");
  // 在歷史中加入引導，讓 AI 知道這是 aha 體驗，用蘇格拉底方式追問 2-3 輪
  chatHistory.push({ role: "assistant", content: "好！來玩個小遊戲。我問你：你覺得天空為什麼是藍的？（這是新用戶的 aha 體驗：接下來用 2-3 輪情境問題讓他發現自己其實沒完全想通，最後點出「你看，你以為你懂，但中間有個洞，這就是小曙的學習方式」）" });
}

async function init() {
  try {
    await renderTopbar("dashboard.html");
    const user = await requireAuth();
    await ensureProfile(supabase, user);

    // 建立學習 context
    learningContext = await buildLearningContext(supabase, user.id);

    // 檢測是否為新用戶（無任何學習數據）
    const isNewUser = (review.count ?? 0) === 0 && (nodes.count ?? 0) === 0;

    // 小曙主動打招呼
    if (isNewUser) {
      $("cp-greeting").innerHTML = `嗨，我是小曙，你的學習陪伴者！<br><br>我跟其他 AI 不一樣——我不會直接給你答案，而是用問題帶你自己想通。<br><br>要不要體驗 1 分鐘看看？👇`;
      $("cp-suggest").innerHTML = `<button class="chip" id="cp-aha">✨ 體驗 1 分鐘</button><button class="chip">先逛逛就好</button>`;
      $("cp-suggest").querySelector("#cp-aha").onclick = startAha;
      $("cp-suggest").querySelectorAll(".chip")[1].onclick = () => {
        $("cp-suggest").innerHTML = "";
        $("cp-greeting").textContent = "沒問題！想學什麼的時候跟我說，我都在。";
      };
    } else {
      try {
        const greet = await companionGreeting(learningContext);
        $("cp-greeting").textContent = greet;
      } catch {
        $("cp-greeting").textContent = "今天想學點什麼？我陪你！";
      }
    }

    // 建議快捷問題
    const suggests = ["我今天該複習什麼？", "推薦一個知識庫給我", "幫我安排這週的學習計畫"];
    $("cp-suggest").innerHTML = suggests.map(s => `<button class="chip">${esc(s)}</button>`).join("");
    $("cp-suggest").querySelectorAll(".chip").forEach(c => c.onclick = () => send(c.textContent));

    // 學習統計
    const now = new Date().toISOString();
    const [review, nodes, profile] = await Promise.all([
      supabase.from("review_cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("next_review_at", now),
      supabase.from("knowledge_nodes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    $("cp-stats").innerHTML = `
      <div class="stat"><div class="num">${review.count ?? 0}</div><div class="lbl">到期複習</div></div>
      <div class="stat"><div class="num">${nodes.count ?? 0}</div><div class="lbl">知識節點</div></div>
      <div class="stat"><div class="num">${profile.data?.streak_days ?? 0}</div><div class="lbl">連續天數</div></div>`;

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
