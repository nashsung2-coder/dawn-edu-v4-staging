/* v4 知識對戰 v2：自適應難度 + 知識內容驗證 + 掌握度追蹤 */
import { supabase, getUser } from "../core/supabase.js";
import { ask } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js?v=fixed002";

await renderTopbar("quiz.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const view = document.getElementById("qz-view");

/* 難度等級：0=簡單 1=普通 2=困難 3=專家 */
const LEVELS = [
  { nm: "簡單", prompt: "出基礎概念記憶題，確認基本理解" },
  { nm: "普通", prompt: "出理解應用題，需要推理" },
  { nm: "困難", prompt: "出深入思考題，包含陷阱選項和情境應用" },
  { nm: "專家", prompt: "出高階綜合題，需要跨概念連結和批判思考" },
];
/* 掌握度門檻：在「困難」以上連對 3 題即視為掌握 */
const MASTERY_STREAK = 3;

let mode = "topic";       // topic | content
let topic = "";
let knowledgeContent = "";
let level = 1;            // 起始：普通
let streak = 0;           // 當前連對
let hardStreak = 0;       // 困難以上連對（掌握度計數）
let totalQ = 0, totalCorrect = 0;
let history = [];         // 答題紀錄
let currentQ = null;

renderSetup();

function renderSetup() {
  view.innerHTML = `
    <div class="card qz-setup" style="max-width:560px;margin:0 auto;">
      <h2>知識對戰</h2>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:16px;">AI 會根據你的答題表現自動調整難度，直到你完全掌握</p>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn ${mode === "topic" ? "btn-primary" : "btn-ghost"} mode-sel" data-m="topic" style="flex:1;">主題對戰</button>
        <button class="btn ${mode === "content" ? "btn-primary" : "btn-ghost"} mode-sel" data-m="content" style="flex:1;">知識驗證</button>
      </div>
      <div id="mode-topic" style="${mode === "topic" ? "" : "display:none;"}">
        <input class="input" id="qz-topic" placeholder="例：光合作用" style="margin-bottom:8px;">
        <div style="margin-bottom:12px;">
          <span style="font-size:12px;color:var(--paper-400);">熱門主題：</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            ${["數學","物理","歷史","生物","英文單字"].map(t =>
              `<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" data-t="${t}">${t}</button>`).join("")}
          </div>
        </div>
      </div>
      <div id="mode-content" style="${mode === "content" ? "" : "display:none;"}">
        <input class="input" id="qz-topic2" placeholder="知識標題（例：光合作用筆記）" style="margin-bottom:8px;">
        <textarea class="input" id="qz-content" placeholder="貼上你要驗證的知識內容…&#10;&#10;AI 會根據這份內容出題，確認你是否真正掌握。內容越詳細，出題越精準。" style="min-height:140px;margin-bottom:8px;resize:vertical;"></textarea>
        <div style="font-size:11px;color:var(--paper-400);margin-bottom:12px;">💡 小技巧：可以直接從知識庫節點複製內容過來</div>
      </div>
      <button class="btn btn-primary" id="qz-go" style="width:100%;">開戰</button>
    </div>`;
  view.querySelectorAll(".mode-sel").forEach(b => {
    b.onclick = () => {
      mode = b.dataset.m;
      renderSetup();
    };
  });
  view.querySelectorAll("[data-t]").forEach(b => {
    b.onclick = () => { document.getElementById("qz-topic").value = b.dataset.t; };
  });
  try {
    const _t = new URLSearchParams(location.search).get("topic");
    if (_t) document.getElementById("qz-topic").value = _t;
    const _c = new URLSearchParams(location.search).get("content");
    const _from = new URLSearchParams(location.search).get("from");
    if (_from === "verify") {
      // 從知識庫驗證跳轉：內容在 sessionStorage
      try {
        const sc = sessionStorage.getItem("verify_content");
        if (sc) { mode = "content"; renderSetup(); document.getElementById("qz-content").value = sc; sessionStorage.removeItem("verify_content"); }
      } catch {}
    } else if (_c) { mode = "content"; renderSetup(); document.getElementById("qz-content").value = decodeURIComponent(_c); }
  } catch {}
  document.getElementById("qz-go").onclick = startBattle;
}

async function startBattle() {
  if (mode === "topic") {
    topic = document.getElementById("qz-topic").value.trim();
    if (!topic) { toast("請輸入主題"); return; }
    knowledgeContent = "";
  } else {
    topic = document.getElementById("qz-topic2").value.trim() || "知識驗證";
    knowledgeContent = document.getElementById("qz-content").value.trim();
    if (!knowledgeContent) { toast("請輸入要驗證的知識內容"); return; }
  }
  level = 1; streak = 0; hardStreak = 0;
  totalQ = 0; totalCorrect = 0; history = [];
  await nextQuestion();
}

async function nextQuestion() {
  const lv = LEVELS[level];
  view.innerHTML = `
    <div class="card" style="max-width:560px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:12px;padding:4px 12px;border-radius:20px;background:oklch(0.75 0.15 80 / 0.15);color:var(--brass-300);">難度：${lv.nm}</span>
        <span style="font-size:12px;color:var(--paper-400);">已答 ${totalQ} 題 · 答對 ${totalCorrect}</span>
      </div>
      ${hardStreak > 0 ? `<div style="margin-bottom:12px;"><div style="font-size:11px;color:var(--paper-400);margin-bottom:4px;">掌握進度 ${hardStreak}/${MASTERY_STREAK}</div><div style="height:6px;border-radius:3px;background:oklch(1 0 0 / 0.08);"><div style="height:100%;width:${(hardStreak / MASTERY_STREAK) * 100}%;border-radius:3px;background:linear-gradient(90deg,#c09030,#f0d080);transition:width .4s;"></div></div></div>` : ""}
      <p style="color:var(--paper-400);">AI 正在出題…</p>
    </div>`;
  try {
    const contextPrompt = knowledgeContent
      ? `以下是使用者要驗證的知識內容，請**嚴格根據此內容**出題，驗證他是否真正掌握：\n---\n${knowledgeContent.slice(0, 3000)}\n---\n`
      : `主題：${topic}\n`;
    const reply = await ask(
      `你是出題老師，專精「迷思概念診斷」。用繁體中文出 1 題單選題（4 個選項）。${lv.prompt}。
重要：每個錯誤選項（誘答）必須對應一個學生常見的迷思概念或錯誤推理，不能是隨便編的錯誤答案。這樣才能從學生的選答診斷出他到底哪裡沒搞懂。
只回 JSON，不要其他文字。格式：
{"question":"題目","options":["選項1純文字","選項2純文字","選項3純文字","選項4純文字"],"answer_index":0,"explanation":"解析（說明正確答案的推理）","misconceptions":{"1":"選了選項2表示的迷思：例如把X誤認為Y","2":"選了選項3表示的迷思：…","3":"選了選項4表示的迷思：…"}}
注意：options 裡不要加 A/B/C/D 前綴；misconceptions 的 key 是選項索引（0起算），只列錯誤選項`,
      contextPrompt
    );
    const m = reply.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("出題格式錯誤");
    currentQ = JSON.parse(m[0]);
    renderQuestion();
  } catch (e) {
    view.innerHTML = `<div class="card" style="max-width:560px;margin:0 auto;"><p style="color:var(--signal-red);">出題失敗：${esc(e.message)}</p>
      <button class="btn btn-ghost" id="qz-back" style="margin-top:12px;">回去</button></div>`;
    document.getElementById("qz-back").onclick = renderSetup;
  }
}

function renderQuestion() {
  const q = currentQ;
  const keys = ["A", "B", "C", "D"];
  const lv = LEVELS[level];
  view.innerHTML = `
    <div class="card" style="max-width:560px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:12px;padding:4px 12px;border-radius:20px;background:oklch(0.75 0.15 80 / 0.15);color:var(--brass-300);">難度：${lv.nm}</span>
        <span style="font-size:12px;color:var(--paper-400);">已答 ${totalQ} 題 · 答對 ${totalCorrect}</span>
      </div>
      ${hardStreak > 0 ? `<div style="margin-bottom:12px;"><div style="font-size:11px;color:var(--paper-400);margin-bottom:4px;">掌握進度 ${hardStreak}/${MASTERY_STREAK}</div><div style="height:6px;border-radius:3px;background:oklch(1 0 0 / 0.08);"><div style="height:100%;width:${(hardStreak / MASTERY_STREAK) * 100}%;border-radius:3px;background:linear-gradient(90deg,#c09030,#f0d080);transition:width .4s;"></div></div></div>` : ""}
      <h2 style="margin-bottom:16px;font-size:17px;">${esc(q.question)}</h2>
      <div id="qz-opts">${q.options.map((o, i) => {
        // 去除 AI 可能自帶的 "A:" "B." "C、" 等前綴，避免跟字母徽章重複
        const clean = String(o).replace(/^[A-D][:\.、\s]+/, "").trim();
        return `<button class="opt-btn" data-i="${i}"><span class="opt-key">${keys[i]}</span>${esc(clean)}</button>`;
      }).join("")}</div>
      <div id="qz-explain" style="display:none;margin-top:16px;padding:12px;border-radius:8px;background:oklch(1 0 0 / 0.04);font-size:13px;line-height:1.7;"></div>
      <button class="btn btn-ghost" id="qz-stop" style="margin-top:16px;width:100%;">結束對戰</button>
    </div>`;
  view.querySelectorAll(".opt-btn").forEach(b => {
    b.onclick = () => answer(Number(b.dataset.i));
  });
  document.getElementById("qz-stop").onclick = () => finish(false);
}

function answer(pick) {
  const q = currentQ;
  const btns = view.querySelectorAll(".opt-btn");
  btns.forEach(b => b.disabled = true);
  document.getElementById("qz-stop").style.display = "none";
  const ai = Number(q.answer_index);
  const validAi = Number.isInteger(ai) && ai >= 0 && ai < btns.length;
  const ok = validAi && pick === ai;
  totalQ++;
  if (ok) {
    totalCorrect++;
    streak++;
    if (validAi) btns[ai].classList.add("correct");
    // 困難以上答對才計入掌握進度
    if (level >= 2) hardStreak++;
    // 連對 2 題升難度
    if (streak >= 2 && level < LEVELS.length - 1) {
      level++;
      streak = 0;
      toast(`難度提升！→ ${LEVELS[level].nm}`);
    }
  } else {
    streak = 0;
    hardStreak = 0;
    if (!ok && pick >= 0 && pick < btns.length) btns[pick].classList.add("wrong");
    if (validAi) btns[ai].classList.add("correct");
    // 答錯降難度
    if (level > 0) {
      level--;
      toast(`難度調整 → ${LEVELS[level].nm}，先打好基礎`);
    }
  }
  history.push({ q: q.question, ok, level: LEVELS[level].nm });
  // 顯示解析（含迷思診斷）
  const exEl = document.getElementById("qz-explain");
  if (q.explanation || !ok) {
    exEl.style.display = "";
    let html = `<strong>${ok ? "答對了！" : "答錯了。"}</strong> `;
    // 答錯時顯示對應的迷思診斷（pick 是用戶選的索引）
    if (!ok && q.misconceptions && typeof pick === "number") {
      const mis = q.misconceptions[String(pick)] || q.misconceptions[pick];
      if (mis) {
        html += `<div style="background:var(--bg-3);padding:10px 14px;border-radius:8px;border-left:3px solid var(--signal-red);margin:8px 0;"><b>診斷：</b>${esc(mis)}</div>`;
      }
    }
    html += esc(q.explanation || "");
    exEl.innerHTML = html;
  }
  // 檢查是否掌握
  if (hardStreak >= MASTERY_STREAK) {
    setTimeout(() => finish(true), 1500);
  } else {
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-primary";
    nextBtn.style.cssText = "margin-top:12px;width:100%;";
    nextBtn.textContent = "下一題";
    nextBtn.onclick = nextQuestion;
    exEl.after(nextBtn);
  }
}

async function finish(mastered) {
  const score = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const maxLevel = history.reduce((m, h) => Math.max(m, LEVELS.findIndex(l => l.nm === h.level)), 0);
  view.innerHTML = `
    <div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">${mastered ? "MASTERED" : "RESULT"}</div>
      ${mastered ? `<div style="font-size:48px;margin-bottom:8px;">🏆</div><h2>完全掌握！</h2><p style="color:var(--paper-400);">你在「${LEVELS[maxLevel]?.nm || ""}」難度連續答對，已掌握「${esc(topic)}」</p>`
        : `<div class="q-score">${score}</div><p style="color:var(--paper-400);margin:8px 0;">答對 ${totalCorrect} / ${totalQ} 題 · 最高難度：${LEVELS[maxLevel]?.nm || "—"}</p>`}
      <div style="text-align:left;margin:16px 0;max-height:200px;overflow-y:auto;border:1px solid oklch(1 0 0 / 0.08);border-radius:8px;padding:12px;">
        ${history.map((h, i) => `<div style="font-size:12px;margin-bottom:6px;"><span style="color:${h.ok ? "var(--leaf-green)" : "var(--signal-red)"};">${h.ok ? "✓" : "✗"}</span> ${esc(h.q.slice(0, 40))}… <span style="color:var(--paper-400);">[${h.level}]</span></div>`).join("")}
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;">
        <button class="btn btn-primary" id="qz-again">再戰一場</button>
        <button class="btn btn-ghost" id="qz-home">回總覽</button>
      </div>
      <div style="border-top:1px solid oklch(1 0 0 / 0.08);padding-top:12px;">
        <p style="font-size:12px;color:var(--paper-400);margin-bottom:8px;">把這場對戰整理成知識節點，滋養你的群島</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <input class="input" id="qz-cat" placeholder="分類（例：物理）" style="width:130px;" maxlength="12">
          <button class="btn btn-ghost" id="qz-node">存為知識節點</button>
        </div>
      </div>
    </div>`;
  document.getElementById("qz-again").onclick = renderSetup;
  document.getElementById("qz-home").onclick = () => location.href = "learn.html";
  document.getElementById("qz-node").onclick = async () => {
    const btn = document.getElementById("qz-node");
    btn.disabled = true;
    const cat = (document.getElementById("qz-cat")?.value || "").trim() || "未分類";
    try {
      await ensureProfile(supabase, user);
      const summary = history.map((h, i) => `${i + 1}. ${h.q}（${h.ok ? "答對" : "答錯"}，${h.level}）`).join("\n")
        + (knowledgeContent ? `\n\n驗證內容：\n${knowledgeContent.slice(0, 500)}` : "");
      const { error } = await supabase.from("knowledge_nodes").insert({
        user_id: user.id,
        title: `對戰：${topic}${mastered ? "（已掌握）" : ""}`,
        content: summary,
        category: cat,
        is_public: false,
      });
      if (error) throw error;
      toast("已存為知識節點（群島成長了）");
      btn.remove();
    } catch (e) {
      toast("存檔失敗：" + e.message);
      btn.disabled = false;
    }
  };
  try {
    await supabase.from("battle_records").insert({
      user_id: user.id,
      question: topic,
      quiz_score: score,
      feynman_score: 0,
      debate_rounds: 0,
    });
  } catch (e) {
    console.warn("戰績存檔失敗:", e.message);
  }
}
