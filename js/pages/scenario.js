/* 情境式學習：化身概念，用經歷去理解 */
import { renderTopbar, requireAuth, esc, toast, md } from "../core/ui.js";
import { ask } from "../core/llm.js";

const $ = id => document.getElementById(id);
const view = $("sc-view");

let supabase, user;
let scenario = null;       // { concept, identity, background, goal, knowledgePoints: [] }
let history = [];          // 對話歷史
let mastered = new Set();  // 已掌握的知識點
let turnCount = 0;

async function init() {
  await renderTopbar("scenario");
  user = await requireAuth();
  ({ supabase } = await import("../core/supabase.js"));
  renderSetup();
}

function renderSetup() {
  view.innerHTML = `
    <div class="sc-setup">
      <div class="sc-field">
        <label>想體驗什麼概念？</label>
        <input type="text" id="sc-concept" placeholder="例：光合作用、牛頓第二定律、均田制、二次函數">
      </div>
      <div class="sc-field">
        <label>或從知識庫選</label>
        <select id="sc-kb"><option value="">— 直接輸入上面 —</option></select>
      </div>
      <button class="sc-btn" id="sc-start">進入情境</button>
      <p style="font-size:12px;color:var(--paper-400);margin-top:12px;line-height:1.7;">
        AI 會為你打造一個世界：你可能是唐朝農民、一顆水分子、一道光。<br>
        透過選擇和對話，你會親身經歷這個概念的運作邏輯。
      </p>
    </div>`;
  // 載入知識庫選項（自己的 + 收藏的）
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
        $("sc-kb").innerHTML = `<option value="">— 直接輸入上面 —</option><optgroup label="我的知識庫">${ownOpts}</optgroup>${favOpts ? `<optgroup label="收藏的">${favOpts}</optgroup>` : ""}`;
        $("sc-kb").onchange = e => { if (e.target.value) $("sc-concept").value = e.target.value; };
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
    const system = `你是情境式學習的編劇。用繁體中文。
用戶想透過「親身經歷」來理解「${concept}」。
你的任務：設計一個沉浸式情境，讓用戶化身為與這個概念相關的角色/物體/存在。

輸出 JSON：
{
  "identity": "用戶的身份（例：你是唐朝開元年間的一戶農民）",
  "background": "世界背景設定（2-3 句）",
  "goal": "用戶在這個情境中的目標",
  "opening": "開場白（旁白+第一個情境描述，200 字內，要有畫面感）",
  "knowledgePoints": ["這個概念下的 4-6 個關鍵知識點（例：租庸調的內容、均田制的崩壞原因）"],
  "firstChoices": ["選項 A（15 字內）", "選項 B", "選項 C"]
}
只輸出 JSON。`;
    const raw = await ask(system, `概念：${concept}`, { model: "fast", json: true });
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    scenario = { concept, ...data };
    history = [];
    mastered = new Set();
    turnCount = 0;
    renderStory(data.opening, data.firstChoices, true);
  } catch (e) {
    view.innerHTML = `<p style="color:var(--signal-red);">情境生成失敗：${esc(e.message)}</p><button class="sc-btn ghost" onclick="location.reload()">重來</button>`;
  }
}

function renderStory(text, choices, isOpening = false) {
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
    <div class="sc-story" id="sc-story">${md(text)}</div>
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
    const system = `你是情境式學習的 AI 導演兼旁白。用繁體中文，畫面感強。
用戶身份：${scenario.identity}
背景：${scenario.background}
目標：${scenario.goal}
概念：${scenario.concept}

尚未探索的知識點：${remaining.join("、") || "（都探索完了）"}
已掌握：${[...mastered].join("、") || "（還沒有）"}

規則：
1. 根據用戶的選擇推進劇情，讓他親身經歷概念的運作
2. 你同時是旁白（描述世界）和 NPC（世界裡的人物跟他對話）
3. 把知識點自然融入劇情，不要生硬講課
4. 每次回應 150-250 字，要有畫面感
5. 結尾給 3 個選項（15 字內），推進劇情或深化理解
6. 如果用戶的選擇讓他體會到了某個知識點，在 JSON 中標記

輸出 JSON：
{
  "story": "劇情文字（可用 **粗體** 強調，可用「」表示 NPC 對話）",
  "choices": ["選項 A", "選項 B", "選項 C"],
  "newlyMastered": ["這次體會到的知識點（必須是 knowledgePoints 中的原話）"],
  "allDone": false
}
只輸出 JSON。`;
    const histText = history.slice(-4).map(h => `${h.role}: ${h.text}`).join("\n");
    const raw = await ask(system,
      `歷史：\n${histText}\n\n用戶選擇：${choice}${isFree ? "（自由輸入）" : ""}`,
      { model: "fast", json: true });
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;

    (data.newlyMastered || []).forEach(k => mastered.add(k));
    history.push({ role: "user", text: choice }, { role: "ai", text: data.story });

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
    renderStory(data.story, data.choices);
    // 把歷史加回去（renderStory 會重建，先保存）
    const sEl = $("sc-story");
    if (sEl) {
      sEl.innerHTML = history.map(h => h.role === "user"
        ? `<div style="margin-top:16px;padding-top:16px;border-top:1px dashed oklch(1 0 0 / 0.15);"><b style="color:var(--brass-300);">你：</b>${esc(h.text)}</div>`
        : `<div style="margin-top:12px;">${md(h.text.replace(/\\n/g, "\n"))}</div>`).join("");
    }
  } catch (e) {
    toast("AI 回應失敗，再試一次");
    document.querySelectorAll(".sc-opt").forEach(b => b.disabled = false);
    $("sc-send").disabled = false;
  }
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
  } catch (e) {
    view.innerHTML = `<p style="color:var(--signal-red);">總結生成失敗</p><button class="sc-btn ghost" onclick="location.href='dashboard.html'">回主控台</button>`;
  }
}

init();
