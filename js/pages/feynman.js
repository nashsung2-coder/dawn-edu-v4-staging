/* v4 費曼說服：解釋 → AI 評估 → 80+ 存入課本 */
import { supabase, getUser } from "../core/supabase.js";
import { ask } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, md, ensureProfile } from "../core/ui.js?v=fixed001";

await renderTopbar("feynman.html");
const user = await requireAuth();

const topicEl = document.getElementById("fy-topic");
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
      toast("達標！可以存入課本了");
    } else {
      toast("還差一點，看看 AI 的建議再試一次");
    }
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--signal-red);font-size:14px;">評估失敗：${esc(e.message)}，請重試。</p>`;
  } finally {
    judgeBtn.disabled = false;
    judgeBtn.textContent = "說服 AI";
  }
};

async function saveToTextbook() {
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
    toast("已存入個人課本＋知識庫（群島成長了）");
    document.getElementById("fy-save")?.remove();
  } catch (e) {
    toast("存入失敗：" + e.message);
  }
}

resetBtn.onclick = () => {
  topicEl.value = "";
  textEl.value = "";
  resultEl.innerHTML = `<p style="color:var(--paper-400);font-size:14px;">在左邊寫下你的解釋，按「說服 AI」。</p>`;
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

/* 歷史說服記錄 */
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
      hEl.innerHTML = `<p style="color:var(--paper-400);font-size:13px;">還沒有說服記錄，完成一次說服就會出現在這裡</p>`;
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
