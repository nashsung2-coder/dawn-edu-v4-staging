/* 引導式倉庫建立：蘇格拉底探索 → 費曼解釋 → 資料建議 → 生成倉庫 */
import { supabase, getUser } from "../core/supabase.js";
import { ask, MODELS } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc } from "../core/ui.js?v=fixed002";

let user, step = 1;
let topic = "", socraticQA = [], feynmanText = "", feynmanScore = null;
let suggestions = [], generatedBlocks = [];

const body = document.getElementById("gc-body");
const stepsEl = document.getElementById("gc-steps");

function setStep(n) {
  step = n;
  stepsEl.querySelectorAll("span").forEach(s => {
    const sn = +s.dataset.s;
    s.className = sn === n ? "on" : (sn < n ? "done" : "");
  });
  render();
}

function render() {
  if (step === 1) renderTopic();
  else if (step === 2) renderSocratic();
  else if (step === 3) renderFeynman();
  else if (step === 4) renderSuggest();
  else if (step === 5) renderGenerate();
}

/* ===== 步驟 1：主題 ===== */
function renderTopic() {
  body.innerHTML = `
    <div class="gc-card">
      <h3 style="margin:0 0 12px;">你想建立什麼主題的知識倉庫？</h3>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">
        輸入一個你想深入學習的主題，AI 會引導你探索它。
      </p>
      <input class="input" id="gc-topic" placeholder="例如：光合作用、牛頓第二定律、鄭氏政權…" value="${esc(topic)}" style="width:100%;margin-bottom:16px;">
      <div class="gc-actions">
        <button class="btn btn-primary" id="gc-next1">開始探索 →</button>
      </div>
    </div>`;
  document.getElementById("gc-next1").onclick = () => {
    const t = document.getElementById("gc-topic").value.trim();
    if (!t) { toast("請輸入主題"); return; }
    topic = t;
    setStep(2);
  };
}

/* ===== 步驟 2：蘇格拉底探索 ===== */
function renderSocratic() {
  if (!socraticQA.length) {
    body.innerHTML = `
      <div class="gc-card">
        <h3 style="margin:0 0 12px;">蘇格拉底正在為「${esc(topic)}」準備問題…</h3>
        <p style="font-size:13px;color:var(--paper-400);">請稍候，AI 正在思考要怎麼引導你。</p>
      </div>`;
    genSocraticQuestions();
    return;
  }
  body.innerHTML = `
    <div class="gc-card">
      <h3 style="margin:0 0 8px;">蘇格拉底探索：${esc(topic)}</h3>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:16px;">
        回答這些問題，幫助你釐清對這個主題的理解。不用完美，誠實回答就好。
      </p>
      ${socraticQA.map((qa, i) => `
        <div class="gc-q">
          <div class="q-label">問題 ${i + 1}</div>
          <div class="q-text">${esc(qa.q)}</div>
          <textarea class="input" id="gc-a${i}" rows="3" placeholder="你的回答…"
            style="width:100%;margin-top:10px;">${esc(qa.a || "")}</textarea>
        </div>`).join("")}
      <div class="gc-actions">
        <button class="btn btn-ghost" id="gc-back2">← 上一步</button>
        <button class="btn btn-ghost" id="gc-regen">換一組問題</button>
        <button class="btn btn-primary" id="gc-next2">繼續 →</button>
      </div>
    </div>`;
  document.getElementById("gc-back2").onclick = () => setStep(1);
  document.getElementById("gc-regen").onclick = () => { socraticQA = []; render(); };
  document.getElementById("gc-next2").onclick = () => {
    socraticQA.forEach((qa, i) => {
      qa.a = document.getElementById(`gc-a${i}`).value.trim();
    });
    if (socraticQA.every(qa => !qa.a)) { toast("至少回答一個問題吧"); return; }
    setStep(3);
  };
}

async function genSocraticQuestions() {
  try {
    const reply = await ask(
      `你是蘇格拉底式的導師。用繁體中文，為「${topic}」這個學習主題設計 3 個引導式探索問題。
規則：
- 問題由淺入深：先問已知，再問未知，最後問應用
- 每個問題要具體，不要空泛
- 語氣好奇、鼓勵
- 每行一個問題，格式：「Q1. 問題內容」
- 不超過 120 字`,
      `主題：${topic}`,
      { model: MODELS.socratic }
    );
    socraticQA = reply.split("\n")
      .map(l => l.replace(/^Q\d+[.、]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .map(q => ({ q, a: "" }));
    if (!socraticQA.length) throw new Error("解析失敗");
  } catch (e) {
    socraticQA = [
      { q: `你對「${topic}」目前最了解的是什麼？`, a: "" },
      { q: `關於「${topic}」，你最想搞懂但還不清楚的是什麼？`, a: "" },
      { q: `「${topic}」在現實生活中有哪些應用或例子？`, a: "" },
    ];
  }
  render();
}

/* ===== 步驟 3：費曼解釋 ===== */
function renderFeynman() {
  body.innerHTML = `
    <div class="gc-card">
      <h3 style="margin:0 0 8px;">費曼解釋：${esc(topic)}</h3>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:16px;">
        假裝你要講給一個完全不懂的人聽，用最簡單的話解釋「${esc(topic)}」的核心概念。
        結合你剛才的探索，把理解寫下來。
      </p>
      ${socraticQA.filter(qa => qa.a).map(qa => `
        <div style="font-size:13px;color:var(--paper-400);margin-bottom:8px;padding:8px 12px;background:oklch(1 0 0/0.03);border-radius:8px;">
          <strong style="color:var(--paper-200);">Q: ${esc(qa.q)}</strong><br>A: ${esc(qa.a)}
        </div>`).join("")}
      <textarea class="input" id="gc-feynman" rows="8" placeholder="用簡單的話解釋…"
        style="width:100%;margin-top:12px;">${esc(feynmanText)}</textarea>
      ${feynmanScore !== null ? `
        <div style="margin-top:12px;padding:12px;border-radius:10px;background:oklch(0.74 0.14 80/0.08);">
          <strong>AI 評估：${feynmanScore} 分</strong>
          <p style="font-size:13px;margin:8px 0 0;">${feynmanScore >= 70 ? "很不錯！可以繼續了。" : "還可以更深入，試著補充細節或例子。"}</p>
        </div>` : ""}
      <div class="gc-actions">
        <button class="btn btn-ghost" id="gc-back3">← 上一步</button>
        <button class="btn btn-ghost" id="gc-eval">AI 評估</button>
        <button class="btn btn-primary" id="gc-next3">繼續 →</button>
      </div>
    </div>`;
  document.getElementById("gc-back3").onclick = () => setStep(2);
  document.getElementById("gc-eval").onclick = evalFeynman;
  document.getElementById("gc-next3").onclick = () => {
    feynmanText = document.getElementById("gc-feynman").value.trim();
    if (feynmanText.length < 20) { toast("多寫一點，至少 20 字"); return; }
    setStep(4);
  };
}

async function evalFeynman() {
  const text = document.getElementById("gc-feynman").value.trim();
  if (text.length < 20) { toast("先寫點內容再評估"); return; }
  feynmanText = text;
  toast("AI 評估中…");
  try {
    const reply = await ask(
      `你是費曼學習法導師。用繁體中文評估學生的解釋，只給 0-100 的分數（格式：分數：XX）和一句簡短建議。不超過 80 字。`,
      `主題：${topic}\n\n學生的解釋：\n${text}`,
      { model: MODELS.reason }
    );
    const m = reply.match(/分數[：:]\s*(\d+)/);
    feynmanScore = m ? Math.min(100, Math.max(0, +m[1])) : 60;
  } catch { feynmanScore = 60; }
  render();
}

/* ===== 步驟 4：資料建議 ===== */
function renderSuggest() {
  if (!suggestions.length) {
    body.innerHTML = `
      <div class="gc-card">
        <h3 style="margin:0 0 12px;">AI 正在為你規劃學習資料…</h3>
        <p style="font-size:13px;color:var(--paper-400);">根據你的主題和理解程度，推薦值得查找的資料方向。</p>
      </div>`;
    genSuggestions();
    return;
  }
  body.innerHTML = `
    <div class="gc-card">
      <h3 style="margin:0 0 8px;">建議查找的資料</h3>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:16px;">
        這些是 AI 根據你的主題和目前理解程度，建議可以深入的方向。勾選你想加入倉庫的項目。
      </p>
      ${suggestions.map((s, i) => `
        <label class="suggest-item" style="cursor:pointer;">
          <input type="checkbox" id="gc-s${i}" ${s.checked !== false ? "checked" : ""} style="margin-top:4px;">
          <span class="s-icon">${s.icon}</span>
          <span>
            <span class="s-title">${esc(s.title)}</span>
            <span class="s-desc">${esc(s.desc)}</span>
          </span>
        </label>`).join("")}
      <div class="gc-actions">
        <button class="btn btn-ghost" id="gc-back4">← 上一步</button>
        <button class="btn btn-primary" id="gc-next4">生成倉庫 →</button>
      </div>
    </div>`;
  document.getElementById("gc-back4").onclick = () => setStep(3);
  document.getElementById("gc-next4").onclick = () => {
    suggestions.forEach((s, i) => {
      s.checked = document.getElementById(`gc-s${i}`).checked;
    });
    setStep(5);
  };
}

async function genSuggestions() {
  const qaText = socraticQA.filter(qa => qa.a).map(qa => `Q:${qa.q}\nA:${qa.a}`).join("\n");
  try {
    const reply = await ask(
      `你是學習規劃師。用繁體中文，針對「${topic}」這個主題，推薦 4-5 個值得學生去查找的資料方向。
規則：
- 每個方向一行，格式：「圖示|標題|一句話說明」
- 圖示用一個 emoji（書籍📚、影片🎬、實驗🧪、網站🌐、人物👤等）
- 方向要多元：理論、歷史、應用、實驗、延伸閱讀
- 針對學生的理解缺口推薦，不要太籠統
- 不超過 200 字`,
      `主題：${topic}\n\n學生的探索：\n${qaText}\n\n學生的費曼解釋：\n${feynmanText}`,
      { model: MODELS.chat }
    );
    suggestions = reply.split("\n")
      .map(l => l.trim()).filter(Boolean).slice(0, 5)
      .map(line => {
        const parts = line.split("|").map(s => s.trim());
        return {
          icon: parts[0] || "📖",
          title: parts[1] || line,
          desc: parts[2] || "",
          checked: true,
        };
      });
    if (!suggestions.length) throw new Error("解析失敗");
  } catch {
    suggestions = [
      { icon: "📚", title: "核心理論", desc: `查找「${topic}」的教科書定義和核心理論`, checked: true },
      { icon: "🕰️", title: "歷史脈絡", desc: "了解這個概念是如何被發現或發展的", checked: true },
      { icon: "🔬", title: "實驗/案例", desc: "找一個經典實驗或實際案例來加深理解", checked: true },
      { icon: "🌐", title: "延伸應用", desc: "探索這個概念在現代科技或生活中的應用", checked: true },
    ];
  }
  render();
}

/* ===== 步驟 5：生成倉庫 ===== */
function renderGenerate() {
  if (!generatedBlocks.length) {
    body.innerHTML = `
      <div class="gc-card">
        <h3 style="margin:0 0 12px;">AI 正在為你生成知識倉庫…</h3>
        <p style="font-size:13px;color:var(--paper-400);">整合你的探索、解釋和選擇的資料方向，生成結構化的知識節點。</p>
      </div>`;
    genWarehouse();
    return;
  }
  const selectedSuggestions = suggestions.filter(s => s.checked);
  body.innerHTML = `
    <div class="gc-card">
      <h3 style="margin:0 0 8px;">你的知識倉庫已生成！</h3>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:16px;">
        以下是 AI 根據你的學習過程生成的初稿。你可以：
      </p>
      <div style="background:oklch(1 0 0/0.03);border-radius:12px;padding:16px;margin-bottom:16px;max-height:400px;overflow-y:auto;">
        ${generatedBlocks.map(b => `
          <div style="margin-bottom:12px;">
            ${b.type === "heading" ? `<h4 style="margin:0 0 8px;color:var(--brass-300);">${esc(b.data.text)}</h4>` : ""}
            ${b.type === "paragraph" ? `<p style="font-size:14px;line-height:1.8;margin:0;">${esc(b.data.text)}</p>` : ""}
            ${b.type === "checklist" ? `<div style="font-size:14px;">${(b.data.items || []).map(it => `<div>☐ ${esc(it.text || it)}</div>`).join("")}</div>` : ""}
          </div>`).join("")}
      </div>
      <div class="gc-actions">
        <button class="btn btn-ghost" id="gc-back5">← 上一步</button>
        <button class="btn btn-ghost" id="gc-regen5">重新生成</button>
        <button class="btn btn-primary" id="gc-publish">去編輯器完善並發布 →</button>
      </div>
    </div>`;
  document.getElementById("gc-back5").onclick = () => setStep(4);
  document.getElementById("gc-regen5").onclick = () => { generatedBlocks = []; render(); };
  document.getElementById("gc-publish").onclick = () => {
    // 存到 localStorage，跳轉到編輯器
    const draft = {
      title: topic,
      question: `什麼是${topic}？`,
      category: "",
      blocks: generatedBlocks,
      _guided: true,
      _socratic: socraticQA,
      _suggestions: selectedSuggestions,
    };
    localStorage.setItem("guided-draft", JSON.stringify(draft));
    location.href = "node-editor.html?guided=1";
  };
}

async function genWarehouse() {
  const qaText = socraticQA.filter(qa => qa.a).map(qa => `Q:${qa.q}\nA:${qa.a}`).join("\n");
  const sugText = suggestions.filter(s => s.checked).map(s => `${s.icon} ${s.title}：${s.desc}`).join("\n");
  try {
    const reply = await ask(
      `你是知識架構師。用繁體中文，為「${topic}」生成一個結構化的知識節點大綱。
規則：
- 用以下格式，每行一個區塊：
  H|標題文字（章節標題）
  P|段落文字（詳細說明，用學生的話改寫得更完整）
  C|待辦項目1;待辦項目2（建議後續學習行動）
- 包含：核心概念、關鍵細節、常見誤區、延伸學習
- 段落要具體、有料，不要空話
- 總共 8-12 個區塊
- 不超過 800 字`,
      `主題：${topic}\n\n學生的探索：\n${qaText}\n\n學生的費曼解釋：\n${feynmanText}\n\n選擇的資料方向：\n${sugText}`,
      { model: MODELS.chat, max_tokens: 3000 }
    );
    generatedBlocks = [];
    for (const line of reply.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const [type, ...rest] = t.split("|");
      const text = rest.join("|").trim();
      if (!text) continue;
      if (type === "H") generatedBlocks.push({ type: "heading", data: { text, level: 2 } });
      else if (type === "P") generatedBlocks.push({ type: "paragraph", data: { text } });
      else if (type === "C") generatedBlocks.push({ type: "checklist", data: { items: text.split(";").map(s => ({ text: s.trim(), checked: false })).filter(i => i.text) } });
    }
    if (!generatedBlocks.length) throw new Error("解析失敗");
  } catch {
    generatedBlocks = [
      { type: "heading", data: { text: topic, level: 2 } },
      { type: "paragraph", data: { text: feynmanText } },
      { type: "heading", data: { text: "延伸學習", level: 3 } },
      { type: "checklist", data: { items: suggestions.filter(s => s.checked).map(s => ({ text: `${s.icon} ${s.title}：${s.desc}`, checked: false })) } },
    ];
  }
  render();
}

/* ===== 初始化 ===== */
(async () => {
  await renderTopbar("guided");
  user = await requireAuth();
  if (!user) return;
  render();
})();
