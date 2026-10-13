/* v4 知識對戰：主題 → AI 出 3 題 → 逐題作答 → 計分存檔 */
import { supabase, getUser } from "../core/supabase.js";
import { ask } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js";

await renderTopbar("quiz.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const view = document.getElementById("qz-view");
let questions = [];
let topic = "";
let qi = 0;
let correct = 0;
let qDifficulty = "normal";
let qCount = 3;

const QDIFF = {
  easy: { nm: "簡單", prompt: "出簡單的基礎概念題，適合初學者" },
  normal: { nm: "普通", prompt: "出中等難度的理解應用題" },
  hard: { nm: "困難", prompt: "出高難度的深入思考題，包含陷阱選項" },
};

renderSetup();

function renderSetup() {
  view.innerHTML = `
    <div class="card qz-setup">
      <h2>開戰主題</h2>
      <input class="input" id="qz-topic" placeholder="例：光合作用" style="margin-bottom:8px;">
      <div style="margin-bottom:12px;">
        <span style="font-size:12px;color:var(--paper-400);">熱門主題：</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;" id="qz-suggest">
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" data-t="數學">數學</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" data-t="物理">物理</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" data-t="歷史">歷史</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" data-t="生物">生物</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" data-t="英文單字">英文單字</button>
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="label" style="margin-bottom:6px;">難度</div>
        <div style="display:flex;gap:8px;">
          ${Object.entries(QDIFF).map(([k, d]) => `
            <button class="btn ${k === "normal" ? "btn-primary" : "btn-ghost"} diff-sel" data-d="${k}" style="flex:1;font-size:13px;">${d.nm}</button>`).join("")}
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <div class="label" style="margin-bottom:6px;">題數</div>
        <div style="display:flex;gap:8px;">
          ${[3, 5, 10].map(n => `
            <button class="btn ${n === 3 ? "btn-primary" : "btn-ghost"} count-sel" data-n="${n}" style="flex:1;font-size:13px;">${n} 題</button>`).join("")}
        </div>
      </div>
      <button class="btn btn-primary" id="qz-go" style="width:100%;">開戰</button>
    </div>`;
  view.querySelectorAll(".diff-sel").forEach(b => {
    b.onclick = () => {
      view.querySelectorAll(".diff-sel").forEach(x => {
        x.classList.remove("btn-primary"); x.classList.add("btn-ghost");
      });
      b.classList.remove("btn-ghost"); b.classList.add("btn-primary");
      qDifficulty = b.dataset.d;
    };
  });
  view.querySelectorAll(".count-sel").forEach(b => {
    b.onclick = () => {
      view.querySelectorAll(".count-sel").forEach(x => {
        x.classList.remove("btn-primary"); x.classList.add("btn-ghost");
      });
      b.classList.remove("btn-ghost"); b.classList.add("btn-primary");
      qCount = Number(b.dataset.n);
    };
  });
  document.getElementById("qz-go").onclick = startBattle;
  document.getElementById("qz-topic").addEventListener("keydown", e => {
    if (e.key === "Enter") startBattle();
  });
  view.querySelectorAll("#qz-suggest button").forEach(b => {
    b.onclick = () => {
      document.getElementById("qz-topic").value = b.dataset.t;
    };
  });
}

async function startBattle() {
  topic = document.getElementById("qz-topic").value.trim();
  if (!topic) { toast("請輸入主題"); return; }
  view.innerHTML = `<div class="card"><p style="color:var(--paper-400);">AI 正在出題（${QDIFF[qDifficulty].nm} · ${qCount} 題）…</p></div>`;
  try {
    const reply = await ask(
      `你是出題老師。用繁體中文出 ${qCount} 題單選題。${QDIFF[qDifficulty].prompt}。只回 JSON 陣列，不要其他文字。格式：[{"question":"題目","options":["A","B","C","D"],"answer_index":0}]`,
      `主題：${topic}`
    );
    const m = reply.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("出題格式錯誤");
    questions = JSON.parse(m[0]);
    if (!Array.isArray(questions) || !questions.length) throw new Error("出題失敗");
    qi = 0; correct = 0;
    renderQuestion();
  } catch (e) {
    view.innerHTML = `<div class="card"><p style="color:var(--signal-red);">出題失敗：${esc(e.message)}</p>
      <button class="btn btn-ghost" id="qz-back" style="margin-top:12px;">回去</button></div>`;
    document.getElementById("qz-back").onclick = renderSetup;
  }
}

function renderQuestion() {
  const q = questions[qi];
  const keys = ["A", "B", "C", "D"];
  view.innerHTML = `
    <div class="q-progress">${questions.map((_, i) =>
      `<i class="${i < qi ? "done" : i === qi ? "cur" : ""}"></i>`).join("")}</div>
    <div class="card">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">Q${qi + 1} / ${questions.length}</div>
      <h2 style="margin-bottom:16px;">${esc(q.question)}</h2>
      <div id="qz-opts">${q.options.map((o, i) =>
        `<button class="opt-btn" data-i="${i}"><span class="opt-key">${keys[i]}</span>${esc(o)}</button>`).join("")}</div>
    </div>`;
  view.querySelectorAll(".opt-btn").forEach(b => {
    b.onclick = () => answer(Number(b.dataset.i));
  });
}

function answer(pick) {
  const q = questions[qi];
  const btns = view.querySelectorAll(".opt-btn");
  btns.forEach(b => b.disabled = true);
  /* answer_index 邊界檢查：AI 回傳異常時視為出錯題，不 crash */
  const ai = Number(q.answer_index);
  const validAi = Number.isInteger(ai) && ai >= 0 && ai < btns.length;
  const ok = validAi && pick === ai;
  if (ok) correct++;
  q.userCorrect = ok;
  if (validAi) btns[ai].classList.add("correct");
  if (!ok && pick >= 0 && pick < btns.length) btns[pick].classList.add("wrong");
  setTimeout(() => {
    qi++;
    if (qi < questions.length) renderQuestion();
    else finish();
  }, 900);
}

async function finish() {
  const score = Math.round((correct / questions.length) * 100);
  view.innerHTML = `
    <div class="card" style="text-align:center;max-width:480px;margin:0 auto;">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">RESULT</div>
      <div class="q-score">${score}</div>
      <p style="color:var(--paper-400);margin:8px 0 20px;">答對 ${correct} / ${questions.length} 題</p>
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
      const summary = questions.map((q, i) => {
        const ans = Number.isInteger(q.answer_index) && q.options?.[q.answer_index]
          ? q.options[q.answer_index] : "（解析異常）";
        return `${i + 1}. ${q.question}（${q.userCorrect ? "答對" : "答錯"}，正解：${ans}）`;
      }).join("\n");
      const { error } = await supabase.from("knowledge_nodes").insert({
        user_id: user.id,
        title: `對戰：${topic}`,
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
    toast("戰績存檔失敗：" + e.message);
  }
}
