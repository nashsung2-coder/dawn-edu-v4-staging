/* 情境式學習：化身概念，用經歷去理解 */
import { renderTopbar, requireAuth, esc, toast, md } from "../core/ui.js";
import { renderTypeHistory } from "../core/learn-history.js";
import { ask } from "../core/llm.js";
import { blocksText } from "../core/blocks.js";

const $ = id => document.getElementById(id);
const view = $("sc-view");

let supabase, user;
let scenario = null;       // { concept, identity, background, goal, knowledgePoints: [] }
let history = [];          // 對話歷史
let mastered = new Set();  // 已掌握的知識點
let turnCount = 0;
let sessionId = null;      // learn_sessions id（恢復進度用）
let lastChoices = [];      // 上次 AI 給的選項（恢復用）
let kbTitle = "";         // 選中的寶庫節點標題
let kbContent = "";       // 選中的寶庫節點內容（餵給 AI 當設計依據）

/* 依標題抓寶庫節點內容（自己的優先，否則公開的） */
async function fetchKbContentByTitle(title) {
  try {
    const { data } = await supabase.from("knowledge_nodes")
      .select("id,title,content,user_id,is_public").eq("title", title).limit(5);
    const row = (data || []).find(r => String(r.user_id) === String(user.id) || r.is_public) || (data || [])[0];
    if (!row) return "";
    try {
      const parsed = JSON.parse(row.content || "{}");
      return blocksText(parsed.blocks || (Array.isArray(parsed) ? parsed : []));
    } catch { return row.content || ""; }
  } catch { return ""; }
}

/* JSON 模式請求：安全解析＋自動重試（AI 回傳偶爾被截斷導致 JSON 不完整） */
async function askJson(system, user, validate, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const raw = await ask(system, user, { model: "fast", json: true, max_tokens: 3000 });
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      let data;
      try { data = JSON.parse(text); }
      catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("JSON 解析失敗");
        data = JSON.parse(m[0]);
      }
      if (validate && !validate(data)) throw new Error("回傳格式不完整");
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* 快照：邊玩邊存，歷史點開可恢復 */
async function saveSnap(extra = {}) {
  if (!sessionId) return;
  try {
    const { saveLearnSession } = await import("../core/learn-history.js");
    saveLearnSession(supabase, sessionId, {
      scenario, history,
      mastered: [...mastered],
      turnCount, choices: lastChoices,
      done: false, ...extra,
    });
  } catch {}
}

function storyHtmlFromHistory() {
  return history.map(h => h.role === "user"
    ? `<div style="margin-top:16px;padding-top:16px;border-top:1px dashed oklch(1 0 0 / 0.15);"><b style="color:var(--brass-300);">你：</b>${esc(h.text)}</div>`
    : `<div style="margin-top:12px;">${md(h.text.replace(/\\n/g, "\n"))}</div>`).join("");
}

async function init() {
  await renderTopbar("scenario");
  user = await requireAuth();
  ({ supabase } = await import("../core/supabase.js"));
  /* 從歷史點開：恢復當時進度 */
  try {
    const sid = new URLSearchParams(location.search).get("session");
    if (sid) {
      const ok = await restoreSession(sid);
      if (ok) { try { renderTypeHistory(supabase, user.id, "sc-history", "情境學習"); } catch {} return; }
    }
  } catch {}
  renderSetup();
  try { renderTypeHistory(supabase, user.id, "sc-history", "情境學習"); } catch {}
}

/* 從快照恢復：回到當時的對話進度；已結束的顯示結算 */
async function restoreSession(sid) {
  try {
    const { loadLearnSession } = await import("../core/learn-history.js");
    const row = await loadLearnSession(supabase, sid, user.id);
    const st = row?.state;
    if (!st?.scenario) return false;
    sessionId = sid;
    scenario = st.scenario;
    history = st.history || [];
    mastered = new Set(st.mastered || []);
    turnCount = st.turnCount || 0;
    lastChoices = st.choices || [];
    if (st.done && st.result) { renderResultCard(st.result, ""); return true; }
    renderStory(storyHtmlFromHistory(), lastChoices);
    toast("已回到上次的進度，繼續吧");
    return true;
  } catch { return false; }
}

function renderSetup() {
  view.innerHTML = `
    <div class="sc-setup">
      <div class="sc-field">
        <label>想體驗什麼概念？</label>
        <input type="text" id="sc-concept" placeholder="例：光合作用、牛頓第二定律、均田制、二次函數">
      </div>
      <div class="sc-field">
        <label>或從曙光寶庫選</label>
        <select id="sc-kb"><option value="">— 直接輸入上面 —</option></select>
      </div>
      <button class="sc-btn" id="sc-start">進入情境</button>
      <p style="font-size:12px;color:var(--paper-400);margin-top:12px;line-height:1.7;">
        AI 會為你打造一個世界：你可能是唐朝農民、一顆水分子、一道光。<br>
        透過選擇和對話，你會親身經歷這個概念的運作邏輯。
      </p>
    </div>`;
  // 從 URL 參數預填概念（從知識節點頁跳過來）：同時抓該節點內容餵給 AI
  try {
    const urlConcept = new URLSearchParams(location.search).get("concept");
    if (urlConcept) {
      $("sc-concept").value = urlConcept;
      kbTitle = urlConcept;
      fetchKbContentByTitle(urlConcept).then(t => { kbContent = t; });
    }
  } catch {}
  // 手動改輸入框且與選中標題不符時，清除快取內容（避免文不對題）
  $("sc-concept").addEventListener("input", e => {
    if (e.target.value.trim() !== kbTitle) { kbTitle = ""; kbContent = ""; }
  });
  // 載入寶庫選項（自己的 + 收藏的）
  (async () => {
    try {
      const { data: own } = await supabase.from("knowledge_nodes")
        .select("title").eq("user_id", user.id).eq("is_public", true).limit(30);
      let favTitles = [];
      try {
        const { data: favs } = await supabase.from("node_favorites").select("node_id").eq("user_id", user.id);
        if (favs?.length) {
          const ids = favs.map(f => f.node_id);
          const { data: favNodes } = await supabase.from("knowledge_nodes").select("title").in("id", ids).eq("is_public", true);
          if (favNodes) favTitles = favNodes.map(n => n.title);
        }
      } catch {}
      const ownTitles = (own || []).map(n => n.title);
      const allTitles = [...new Set([...ownTitles, ...favTitles])];
      if (allTitles.length) {
        const ownOpts = ownTitles.map(t => `<option value="${esc(t)}">${esc(t)}（我的）</option>`).join("");
        const favOpts = favTitles.filter(t => !ownTitles.includes(t)).map(t => `<option value="${esc(t)}">${esc(t)}（收藏）</option>`).join("");
        $("sc-kb").innerHTML = `<option value="">— 直接輸入上面 —</option><optgroup label="我的寶庫">${ownOpts}</optgroup>${favOpts ? `<optgroup label="收藏的">${favOpts}</optgroup>` : ""}`;
        $("sc-kb").onchange = e => {
          if (e.target.value) {
            $("sc-concept").value = e.target.value;
            kbTitle = e.target.value;
            kbContent = "";
            fetchKbContentByTitle(e.target.value).then(t => { kbContent = t; });
          } else { kbTitle = ""; kbContent = ""; }
        };
      }
    } catch {}
  })();
  $("sc-start").onclick = startScenario;
}

async function startScenario() {
  const concept = $("sc-concept").value.trim();
  if (!concept) { toast("請輸入或選擇一個概念"); return; }
  view.innerHTML = `<p style="color:var(--paper-400);">AI 正在為你打造世界…</p>`;
  try {
    const kbRef = kbContent.trim()
      ? `\n\n以下是曙光寶庫中「${kbTitle}」的完整內容。請嚴格根據這份內容設計情境——身份、背景、知識點都必須出自這份內容，可以改寫成親身經歷的視角，但不要編造內容裡沒有的事實：\n---\n${kbContent.trim().slice(0, 5000)}\n---`
      : "";
    const system = `你是情境式學習的編劇。用繁體中文。
用戶想透過「親身經歷」來理解「${concept}」。${kbRef}
你的任務：設計一個高密度、高抉擇的沉浸式情境，讓用戶化身為與這個概念相關的角色。

設計原則（嚴格遵守）：
1. 緊湊：砍掉所有為氣氛而寫的鋪陳。每一句話都要麼推進抉擇、要麼透露知識背景。場景描寫只為知識點服務，不為畫面感而寫。
2. 知識環境背景：把時代、地理、制度背景織進身份與背景設定——例如當時的稅制如何壓在這個身份身上、地理位置帶來什麼限制或機會、時局如何收緊他的選項。背景不是裝飾，是後續每個抉擇的約束條件。
3. 真抉擇：開場必須是一個兩難。選項之間有真實的利弊權衡，每個選項背後對應一種知識視角（例如：順從制度 vs 鑽制度漏洞 vs 承擔代價反抗，分別對應制度如何運作、制度如何被規避、制度崩壞的代價）。不要設計正確答案很明顯的選項。
4. 知識點 4-6 個，必須是這個概念下真正需要理解的機制性知識（如何運作、為何這樣設計、在什麼條件下崩壞），不要列常識。

輸出 JSON：
{
  "identity": "用戶的身份（一句話，包含時代、階層、處境，例：你是唐朝開元年間關中的一戶均田農民，家有五口，剛領到口分田）",
  "background": "世界背景設定（2-3 句，每句都要是後續抉擇的約束條件：稅制、地形、時局、身份限制）",
  "goal": "用戶在這個情境中的目標（一個具體的、需要權衡的目標）",
  "opening": "開場白（約400字：先把完整背景一次講清楚——你是誰、身在何時何地、當時的稅制/制度/地形/時局如何壓在你身上、你當下的處境與目標；背景一次講足，不要擠牙膏。講完直接拋出兩難抉擇。不要風景描寫，不要心理獨白，每句都要有資訊量）",
  "knowledgePoints": ["4-6 個機制性知識點（例：租庸調如何按丁徵收、均田制崩壞的連鎖條件）"],
  "firstChoices": ["選項 A（15 字內，代表一種知識視角）", "選項 B", "選項 C"]
}
只輸出 JSON。`;
    const data = await askJson(system, `概念：${concept}`,
      d => d && d.opening && Array.isArray(d.firstChoices) && Array.isArray(d.knowledgePoints));
    scenario = { concept, ...data };
    history = [];
    mastered = new Set();
    turnCount = 0;
    /* 建立學習會話：之後每回合存快照，歷史可點開恢復 */
    try {
      const { createLearnSession } = await import("../core/learn-history.js");
      sessionId = await createLearnSession(supabase, user.id, "情境學習", concept);
    } catch {}
    renderStory(md(data.opening), data.firstChoices);
    saveSnap();
  } catch (e) {
    view.innerHTML = `<p style="color:var(--signal-red);">情境生成失敗：${esc(e.message)}</p><button class="sc-btn ghost" onclick="location.reload()">重來</button>`;
  }
}

function renderStory(storyHtml, choices) {
  lastChoices = choices || [];
  const progress = scenario.knowledgePoints.length
    ? Math.round(mastered.size / scenario.knowledgePoints.length * 100) : 0;
  const masteredList = [...mastered].map(m => `✓ ${esc(m)}`).join("<br>");
  view.innerHTML = `
    <div class="sc-progress">
      <div>📍 ${esc(scenario.identity)}</div>
      <div style="margin-top:4px;">🎯 目標：${esc(scenario.goal)}</div>
      <div class="bar"><div style="width:${progress}%"></div></div>
      <div style="margin-top:6px;font-size:12px;">探索進度 ${progress}%（${mastered.size}/${scenario.knowledgePoints.length} 個知識點）</div>
      ${mastered.size ? `<div class="sc-mastered">${masteredList}</div>` : ""}
    </div>
    <div class="sc-story" id="sc-story">${storyHtml}</div>
    <div class="sc-opts" id="sc-opts">
      ${choices.map((c, i) => `<button class="sc-opt" data-i="${i}">${esc(c)}</button>`).join("")}
    </div>
    <div class="sc-input-row">
      <input type="text" id="sc-free" placeholder="或自由輸入你想做什麼…">
      <button class="sc-btn" id="sc-send">送出</button>
    </div>
    <div style="margin-top:12px;text-align:center;">
      <button class="sc-btn ghost" id="sc-end" style="font-size:12px;padding:8px 16px;">結束情境看總結</button>
    </div>`;

  document.querySelectorAll(".sc-opt").forEach(btn => {
    btn.onclick = () => doChoice(choices[parseInt(btn.dataset.i)]);
  });
  $("sc-send").onclick = () => {
    const t = $("sc-free").value.trim();
    if (t) doChoice(t, true);
  };
  $("sc-free").addEventListener("keydown", e => {
    if (e.key === "Enter") $("sc-send").click();
  });
  $("sc-end").onclick = endScenario;
  // 捲到故事區
  $("sc-story").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function doChoice(choice, isFree = false) {
  // 鎖定選項
  document.querySelectorAll(".sc-opt").forEach(b => b.disabled = true);
  $("sc-send").disabled = true;
  turnCount++;

  const storyEl = $("sc-story");
  storyEl.innerHTML += `<div style="margin-top:16px;padding-top:16px;border-top:1px dashed oklch(1 0 0 / 0.15);"><b style="color:var(--brass-300);">你：</b>${esc(choice)}</div>`;
  storyEl.innerHTML += `<div style="margin-top:8px;color:var(--paper-400);">…</div>`;
  storyEl.scrollTop = storyEl.scrollHeight;

  try {
    const remaining = scenario.knowledgePoints.filter(k => !mastered.has(k));
    const system = `你是情境式學習的 AI 導演。用繁體中文，文字緊湊。
用戶身份：${scenario.identity}
背景：${scenario.background}
目標：${scenario.goal}
概念：${scenario.concept}

尚未探索的知識點：${remaining.join("、") || "（都探索完了）"}
已掌握：${[...mastered].join("、") || "（還沒有）"}

規則（嚴格遵守）：
1. 篇幅與完整：每次回應約400字。先把這一幕的完整背景交代清楚（人物處境、相關的時代/地理/制度事實，一次講足，不擠牙膏），再推進抉擇。砍掉氣氛鋪陳；每一句都要麼揭示一個背景事實、要麼推進抉擇，不寫廢話。
2. 知識織入：用 NPC 的話或事件後果，自然揭露時代、地理、制度背景（例如：官差報出的稅額數字、鄰居因地形做出的不同選擇、時局變化如何收緊選項）。背景是抉擇的約束條件，不是旁白裝飾。
3. 真抉擇：結尾的 3 個選項必須是兩難——每個選項都有代價，每個選項背後對應一種知識視角。不要出現明顯正確的選項；要讓用戶必須用剛學到的知識推理才能判斷利弊，而不是憑感覺選。
4. 後果誠實：用戶的選擇要產生符合史實與知識邏輯的後果。好選擇也可能有代價；壞選擇要讓他明白錯在哪個知識環節。
5. 知識點標記：只有當用戶的選擇或追問真正觸及某個知識點的機制（如何運作、為何如此、有何代價），才在 newlyMastered 標記。不要因為提到名詞就標記。

輸出 JSON：
{
  "story": "劇情文字（約400字：背景一次講完整，再推進抉擇。可用 **粗體** 標出關鍵知識事實，可用「」表示 NPC 對話）",
  "choices": ["選項 A（15 字內，兩難的一端）", "選項 B", "選項 C"],
  "newlyMastered": ["這次真正體會到的知識點（必須是 knowledgePoints 中的原話）"],
  "allDone": false
}
只輸出 JSON。`;
    const histText = history.slice(-4).map(h => `${h.role}: ${h.text}`).join("\n");
    const data = await askJson(system,
      `歷史：\n${histText}\n\n用戶選擇：${choice}${isFree ? "（自由輸入）" : ""}`,
      d => d && d.story && Array.isArray(d.choices));

    (data.newlyMastered || []).forEach(k => mastered.add(k));
    history.push({ role: "user", text: choice }, { role: "ai", text: data.story });
    saveSnap();

    // 移除 "..." 並加上新劇情（先把字面量 \n 轉成換行）
    storyEl.innerHTML = storyEl.innerHTML.replace(/<div style="margin-top:8px;color:var\(--paper-400\);">…<\/div>/, "");
    const cleanStory = data.story.replace(/\\n/g, "\n");
    storyEl.innerHTML += `<div style="margin-top:12px;">${md(cleanStory)}</div>`;
    storyEl.scrollTop = storyEl.scrollHeight;

    // 檢查是否全部探索完
    if (mastered.size >= scenario.knowledgePoints.length) {
      endScenario();
      return;
    }
    renderStory(storyHtmlFromHistory(), data.choices);
  } catch (e) {
    toast("AI 回應失敗，再試一次");
    document.querySelectorAll(".sc-opt").forEach(b => b.disabled = false);
    $("sc-send").disabled = false;
  }
}

function renderResultCard(data, saveMsg) {
  view.innerHTML = `
      <div class="card" style="max-width:640px;margin:0 auto;text-align:center;padding:32px;">
        <div class="en" style="font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">JOURNEY COMPLETE</div>
        <h2>旅程結束</h2>
        <div style="font-size:48px;font-weight:700;color:var(--brass-300);margin:16px 0;">${data.mastery}%</div>
        <p style="color:var(--paper-300);line-height:1.8;margin-bottom:16px;">${esc(data.summary)}</p>
        ${data.strengths?.length ? `<div style="text-align:left;margin-bottom:12px;"><b style="color:var(--signal-green);">做得好的：</b><ul style="padding-left:20px;color:var(--paper-300);font-size:14px;">${data.strengths.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
        ${data.toImprove?.length ? `<div style="text-align:left;margin-bottom:16px;"><b style="color:var(--brass-300);">可以再深入：</b><ul style="padding-left:20px;color:var(--paper-300);font-size:14px;">${data.toImprove.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
        ${saveMsg}
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
          <button class="sc-btn" onclick="location.reload()">再來一次</button>
          <button class="sc-btn ghost" onclick="location.href='dashboard.html'">回主控台</button>
        </div>
      </div>`;
}

async function endScenario() {
  view.innerHTML = `<p style="color:var(--paper-400);">AI 正在為你總結這次旅程…</p>`;
  try {
    const system = `你是學習評估師。用繁體中文。`;
    const histText = history.map(h => `${h.role === "user" ? "用戶" : "AI"}: ${h.text}`).join("\n\n");
    const prompt = `用戶剛完成「${scenario.concept}」的情境式學習。
身份：${scenario.identity}
已掌握的知識點：${[...mastered].join("、")}
全部知識點：${scenario.knowledgePoints.join("、")}
互動回合：${turnCount}

對話歷史：
${histText}

請輸出 JSON：
{
  "mastery": 85,
  "summary": "這次旅程的總結（150 字內，點出他經歷了什麼、理解了什麼）",
  "strengths": ["他理解得好的地方"],
  "toImprove": ["還可以深入的地方"],
  "saveNode": {"title": "知識節點標題", "content": "用 200 字總結這次學到的核心概念"}
}
只輸出 JSON。`;
    const raw = await ask(system, prompt, { model: "fast", json: true });
    let data;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      // 嘗試從回覆中提取 JSON
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { data = JSON.parse(m[0]); } catch {} }
    }
    // 還是失敗就用預設值，不讓整個總結掛掉
    if (!data || typeof data.mastery !== "number") {
      const pct = scenario.knowledgePoints.length ? Math.round(mastered.size / scenario.knowledgePoints.length * 100) : 0;
      data = {
        mastery: pct,
        summary: `你以「${scenario.identity}」的身份，經歷了「${scenario.concept}」的世界，共進行了 ${turnCount} 回合互動，掌握了 ${mastered.size} 個知識點。`,
        strengths: [...mastered].slice(0, 3),
        toImprove: scenario.knowledgePoints.filter(k => !mastered.has(k)).slice(0, 3),
        saveNode: { title: `${scenario.concept}（情境學習）`, content: `透過情境式學習探索了${scenario.concept}，掌握：${[...mastered].join("、") || "（尚在探索）"}` }
      };
    }

    // 存成知識節點
    let saveMsg = "";
    try {
      const { error } = await supabase.from("knowledge_nodes").insert({
        user_id: user.id,
        title: data.saveNode.title,
        content: JSON.stringify({ blocks: [{ type: "p", text: data.saveNode.content }] }),
        category: "情境學習",
        is_public: false,
      });
      saveMsg = error ? "" : `<p style="font-size:13px;color:var(--signal-green);">✓ 已存為知識節點「${esc(data.saveNode.title)}」</p>`;
    } catch {}

    /* 寫入學習歷程（帶 session，點開可回到這次旅程） */
    try {
      const { logLearnHistory, refreshHistoryUI, sessionLink } = await import("../core/learn-history.js");
      await saveSnap({ done: true, result: data });
      await logLearnHistory(supabase, user.id, {
        type: "情境學習",
        topic: scenario.concept,
        detail: `扮演${scenario.identity}・${turnCount} 回合・掌握度 ${data.mastery}%`,
        link: sessionLink("scenario.html", sessionId),
      });
        await refreshHistoryUI(supabase, user.id);
  } catch {}

    renderResultCard(data, saveMsg);
  } catch (e) {
    view.innerHTML = `<p style="color:var(--signal-red);">總結生成失敗</p><button class="sc-btn ghost" onclick="location.href='dashboard.html'">回主控台</button>`;
  }
}

init();
