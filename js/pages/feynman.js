/* v4 費曼討論：解釋 → 與 AI 討論 → 整理存入課本 */
import { supabase, getUser } from "../core/supabase.js";
import { ask, MODELS } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, md, ensureProfile } from "../core/ui.js?v=fixed002";

await renderTopbar("feynman.html");
const user = await requireAuth();

const topicEl = document.getElementById("fy-topic");
initKbSelector("fy-kb", "fy-topic", supabase, user.id);
// 知識庫選擇器（延遲初始化，等 user 確定）
/* 從知識庫提問引導跳轉：預填主題 */
try {
  const _q = new URLSearchParams(location.search).get("q");
  if (_q) topicEl.value = _q;
} catch {}
const textEl = document.getElementById("fy-text");
const resultEl = document.getElementById("fy-result");
const judgeBtn = document.getElementById("fy-judge");
const resetBtn = document.getElementById("fy-reset");
const steps = document.querySelectorAll("#fy-steps span");

function setStep(n) {
  steps.forEach(s => s.classList.toggle("on", Number(s.dataset.s) <= n));
}

let lastScore = null;
let lastFeedback = "";

judgeBtn.onclick = async () => {
  const topic = topicEl.value.trim();
  const text = textEl.value.trim();
  if (!topic) { toast("請先輸入主題"); topicEl.focus(); return; }
  if (text.length < 20) { toast("解釋太短，多寫一點"); textEl.focus(); return; }

  judgeBtn.disabled = true;
  judgeBtn.textContent = "評估中…";
  setStep(3);
  resultEl.innerHTML = `<p style="color:var(--paper-400);font-size:14px;">AI 正在閱讀你的解釋…</p>`;

  try {
    const reply = await ask(
      "你是嚴格的老師。用繁體中文評估學生的解釋。先給 0-100 的完整度分數（格式：分數：XX），再指出缺失與建議。簡潔，不超過 200 字。",
      `主題：${topic}\n\n學生的解釋：\n${text}`
    ,
      { model: MODELS.reason }
    );
    const m = reply.match(/分數[：:]\s*(\d+)/);
    lastScore = m ? Math.min(100, Math.max(0, Number(m[1]))) : null;
    lastFeedback = reply;

    const pass = lastScore !== null && lastScore >= 80;
    resultEl.innerHTML = `
      <div class="score-ring"><span class="v">${lastScore ?? "?"}</span><span class="l">完整度</span></div>
      <div class="feedback">${md(reply)}</div>
      ${pass ? `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input class="input" id="fy-cat" placeholder="分類（例：物理）" style="width:140px;" maxlength="12">
        <button class="btn btn-primary" id="fy-save">存入課本＋知識庫</button>
      </div>
      <p style="font-size:12px;color:var(--paper-400);margin-top:6px;">同時寫入個人課本與知識庫（滋養你的群島）</p>` : ""}
    `;
    if (pass) {
      document.getElementById("fy-save").onclick = saveToTextbook;
      toast("討論完成！可以整理存入課本了");
    } else {
      toast("繼續聊聊，把概念弄得更清楚");
    }
    // 蘇格拉底追問：無論分數高低，都提供深度挑戰
    await socraticChallenge(topic, text, lastScore, reply);
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--signal-red);font-size:14px;">評估失敗：${esc(e.message)}，請重試。</p>`;
  } finally {
    judgeBtn.disabled = false;
    judgeBtn.textContent = "與 AI 討論";
  }
};


/* ===== 蘇格拉底式追問：挑戰邏輯漏洞 ===== */
let socraticHistory = [];
async function socraticChallenge(topic, text, score, feedback) {
  const challengeEl = document.createElement("div");
  challengeEl.id = "socratic-box";
  challengeEl.style.cssText = "margin-top:20px;padding:16px;border-radius:12px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);";
  challengeEl.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">蘇格拉底正在思考要怎麼挑戰你…</p>`;
  resultEl.appendChild(challengeEl);
  // 自動滾動到蘇格拉底區塊
  setTimeout(() => challengeEl.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  socraticHistory = [{ topic, text }];

  try {
    const questions = await ask(
      `你是蘇格拉底式的導師。用繁體中文，針對學生的解釋提出 2-3 個尖銳的追問，挑戰他的邏輯漏洞、未經檢驗的假設、或過度簡化的地方。
規則：
- 問題要具體，針對他解釋中的具體內容，不要空泛
- 語氣是好奇的挑戰，不是批評
- 每個問題一行，前面加「Q1.」「Q2.」編號
- 不要給答案，只提問
- 不超過 150 字`,
      `主題：${topic}\n\n學生的解釋：\n${text}\n\nAI 評估：${feedback}`,
      { model: MODELS.socratic }
    );
    socraticHistory.push({ questions });
    challengeEl.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:#c4b5fd;margin-bottom:12px;">蘇格拉底的挑戰</div>
      <div style="font-size:14px;line-height:1.8;color:var(--paper-200);white-space:pre-wrap;margin-bottom:16px;">${esc(questions)}</div>
      <textarea id="socratic-answer" class="input" rows="4" placeholder="試著回答這些挑戰…" style="width:100%;margin-bottom:12px;"></textarea>
      <button class="btn btn-primary btn-sm" id="socratic-submit">回應挑戰</button>
      <div id="socratic-feedback" style="margin-top:12px;"></div>
    `;
    document.getElementById("socratic-submit").onclick = () => answerSocratic(topic, questions);
  } catch (e) {
    challengeEl.innerHTML = `<p style="font-size:13px;color:var(--signal-red);">挑戰生成失敗：${esc(e.message)}</p>`;
  }
}

async function answerSocratic(topic, questions) {
  const answerEl = document.getElementById("socratic-answer");
  const feedbackEl = document.getElementById("socratic-feedback");
  const answer = answerEl.value.trim();
  if (answer.length < 10) { toast("多寫一點，讓蘇格拉底看到你的思考"); return; }

  feedbackEl.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">蘇格拉底正在審視你的回答…</p>`;
  try {
    const reply = await ask(
      `你是蘇格拉底式的導師。用繁體中文評估學生對挑戰問題的回答。
- 如果回答有道理，肯定他的思考，並指出他進步的地方
- 如果還有漏洞，繼續追問 1-2 個更深的問題
- 如果回答完全迴避問題，直接指出
簡潔，不超過 180 字。`,
      `主題：${topic}\n\n挑戰問題：\n${questions}\n\n學生的回答：\n${answer}`,
      { model: MODELS.socratic }
    );
    socraticHistory.push({ answer, reply });
    feedbackEl.innerHTML = `<div style="font-size:14px;line-height:1.8;color:var(--paper-200);white-space:pre-wrap;">${esc(reply)}</div>`;
    toast("蘇格拉底回應了");
  } catch (e) {
    feedbackEl.innerHTML = `<p style="font-size:13px;color:var(--signal-red);">評估失敗：${esc(e.message)}</p>`;
  }
}

async function saveToTextbook() {
  const btn = document.getElementById("fy-save");
  if (!btn || btn.disabled) return; // 防重複點擊
  btn.disabled = true;
  btn.textContent = "存入中…";
  const topic = topicEl.value.trim();
  const cat = (document.getElementById("fy-cat")?.value || "").trim() || "未分類";
  try {
    await ensureProfile(supabase, user);
    const { error } = await supabase.from("textbook_entries").insert({
      user_id: user.id,
      topic,
      title: topic,
      user_voice_summary: textEl.value.trim(),
      ai_supplement: lastFeedback,
      key_points: [],
    });
    if (error) throw error;
    /* 同時寫入知識庫：費曼是知識庫的附加品，產出滋養群島 */
    try {
      await supabase.from("knowledge_nodes").insert({
        user_id: user.id,
        title: topic,
        content: textEl.value.trim(),
        explanation: lastFeedback,
        category: cat,
        is_public: false,
      });
    } catch (e) { console.warn("知識庫寫入失敗", e); }
    /* 寫入 battle_records：讓學習頁今日任務能偵測到完成 */
    try {
      await supabase.from("battle_records").insert({
        user_id: user.id,
        question: topic,
        feynman_score: lastScore,
        quiz_score: 0,
      });
    } catch (e) { console.warn("戰績寫入失敗", e); }
    toast("已存入個人課本＋知識庫（預設不公開，可到知識庫改為公開）");
    btn.textContent = "已存入 ✓";
  } catch (e) {
    toast("存入失敗：" + e.message);
  }
}

resetBtn.onclick = () => {
  topicEl.value = "";
  textEl.value = "";
  resultEl.innerHTML = `<p style="color:var(--paper-400);font-size:14px;">在左邊寫下你的理解，按「與 AI 討論」，一起把概念聊透。</p>`;
  lastScore = null;
  setStep(1);
};

topicEl.addEventListener("input", () => setStep(topicEl.value.trim() ? 2 : 1));

/* 主題建議 */
document.querySelectorAll("#fy-suggest button").forEach(b => {
  b.onclick = () => {
    topicEl.value = b.dataset.t;
    setStep(2);
    textEl.focus();
  };
});

/* 歷史討論記錄 */
async function loadHistory() {
  const hEl = document.getElementById("fy-history");
  try {
    const { data, error } = await supabase.from("battle_records")
      .select("question, feynman_score, created_at")
      .eq("user_id", user.id)
      .gt("feynman_score", 0)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    if (!data?.length) {
      hEl.innerHTML = `<p style="color:var(--paper-400);font-size:13px;">還沒有討論記錄，完成一次討論就會出現在這裡</p>`;
      return;
    }
    hEl.innerHTML = data.map(r => {
      const d = new Date(r.created_at);
      const date = `${d.getMonth() + 1}/${d.getDate()}`;
      const s = Number(r.feynman_score) || 0;
      const color = s >= 80 ? "var(--signal-green)" : s >= 60 ? "var(--brass-300)" : "var(--paper-400)";
      return `<div style="padding:8px 0;border-bottom:1px solid oklch(1 0 0 / 0.06);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;">${esc(r.question || "未命名")}</span>
        <span style="font-size:13px;"><span class="mono" style="color:${color};font-weight:700;">${s}</span> <span style="color:var(--paper-400);">· ${date}</span></span>
      </div>`;
    }).join("");
  } catch (e) {
    hEl.innerHTML = `<p style="color:var(--paper-400);font-size:13px;">載入失敗</p>`;
  }
}
loadHistory();
