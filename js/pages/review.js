/* v4 複習：SM-2 間隔重複 + 挑戰模式（對戰化） */
import { supabase, getUser } from "../core/supabase.js";
import { ask } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js?v=fixed001";

await renderTopbar("review.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const view = document.getElementById("rv-view");
let cards = [];
let idx = 0;
let done = 0;
let mode = "flow";  // flow=心流複習, battle=挑戰模式
let difficulty = "normal";  // easy, normal, hard
let score = 0;
let streak = 0;

const DIFF = {
  easy:   { nm: "簡單", time: 0,  pts: 10, desc: "無時間限制，答對 +10" },
  normal: { nm: "普通", time: 30, pts: 20, desc: "30 秒作答，答對 +20" },
  hard:   { nm: "困難", time: 15, pts: 30, desc: "15 秒作答，答對 +30，答錯 -10" },
};

/* SM-2：grade 0=忘記 1=模糊 2=記得 */
function sm2(card, grade) {
  let { ease_factor: ef, interval_days: iv, repetitions: rep } = card;
  ef = Number(ef) || 2.5;
  iv = Number(iv) || 1;
  rep = Number(rep) || 0;
  if (grade >= 1) {
    if (rep === 0) iv = 1;
    else if (rep === 1) iv = 6;
    else iv = Math.round(iv * ef);
    rep++;
    ef = ef + (0.1 - (2 - grade) * (0.08 + (2 - grade) * 0.02));
    if (ef < 1.3) ef = 1.3;
  } else {
    rep = 0;
    iv = 1;
  }
  const next = new Date();
  next.setDate(next.getDate() + iv);
  return { ease_factor: ef, interval_days: iv, repetitions: rep, next_review_at: next.toISOString() };
}

async function load() {
  view.innerHTML = `<div class="card"><p style="color:var(--paper-400);">載入中…</p></div>`;
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("review_cards")
      .select("*").eq("user_id", user.id).lte("next_review_at", now)
      .order("next_review_at", { ascending: true }).limit(50);
    if (error) throw error;
    cards = data || [];
    idx = 0; done = 0; score = 0; streak = 0;
    renderModeSelect();
  } catch (e) {
    view.innerHTML = `<div class="card"><p style="color:var(--signal-red);">載入失敗：${esc(e.message)}</p>
      <button class="btn btn-ghost" style="margin-top:12px;" onclick="location.reload()">重試</button></div>`;
  }
}

/* 模式 + 難度選擇 */
function renderModeSelect() {
  if (!cards.length) {
    view.innerHTML = `<div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
      <h2>今日無到期卡片</h2>
      <p style="color:var(--paper-400);">去學習新內容，系統會自動產生複習卡片</p>
      <div style="margin-top:16px;"><button class="btn btn-primary" onclick="location.href='learn.html'">去學習</button></div></div>`;
    return;
  }
  view.innerHTML = `
    <div class="card" style="max-width:560px;margin:0 auto;">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">REVIEW MODE</div>
      <h2 style="margin-bottom:4px;">今日有 ${cards.length} 張卡片待複習</h2>
      <p style="color:var(--paper-400);font-size:13px;margin-bottom:16px;">選擇複習模式</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <button class="opt-card mode-btn" data-m="flow">
          <div><img class="mode-ico" src="../assets/icons/icon-flow.webp" alt="心流" loading="lazy"></div><div class="nm">心流複習</div><div class="ds">安靜專注，自己評分</div>
        </button>
        <button class="opt-card mode-btn" data-m="battle">
          <div><img class="mode-ico" src="../assets/icons/nav-quiz.webp" alt="挑戰" loading="lazy"></div><div class="nm">挑戰模式</div><div class="ds">對戰化答題，賺星砂</div>
        </button>
      </div>
      <div id="diff-row" style="display:none;">
        <h3 style="margin-bottom:8px;font-size:15px;">選擇難度</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
          ${Object.entries(DIFF).map(([k, d]) => `
            <button class="opt-card diff-btn" data-d="${k}">
              <div class="nm">${d.nm}</div><div class="ds">${d.desc}</div>
            </button>`).join("")}
        </div>
      </div>
      <button class="btn btn-primary" id="rv-start" style="width:100%;" disabled>開始複習</button>
    </div>`;
  let selMode = null, selDiff = "normal";
  const startBtn = document.getElementById("rv-start");
  view.querySelectorAll(".mode-btn").forEach(b => {
    b.onclick = () => {
      view.querySelectorAll(".mode-btn").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
      selMode = b.dataset.m;
      document.getElementById("diff-row").style.display = selMode === "battle" ? "" : "none";
      startBtn.disabled = false;
      startBtn.textContent = selMode === "battle" ? "開始挑戰" : "開始複習";
    };
  });
  view.querySelectorAll(".diff-btn").forEach(b => {
    if (b.dataset.d === "normal") b.classList.add("sel");
    b.onclick = () => {
      view.querySelectorAll(".diff-btn").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
      selDiff = b.dataset.d;
    };
  });
  startBtn.onclick = () => {
    mode = selMode;
    difficulty = selDiff;
    if (mode === "battle") renderBattle();
    else render();
  };
}

/* ===== 挑戰模式 ===== */
let battleTimer = null;
let timeLeft = 0;

async function renderBattle() {
  if (idx >= cards.length) return renderBattleDone();
  const c = cards[idx];
  const d = DIFF[difficulty];
  view.innerHTML = `
    <p style="margin-bottom:12px;color:var(--paper-400);font-size:13px;">
      <span class="rv-count">${idx + 1} / ${cards.length}</span> ·
      得分 <span class="mono" style="color:var(--brass-300);">${score}</span> ·
      連擊 <span class="mono">x${streak}</span>
      ${d.time ? `· <span id="rv-timer" class="mono" style="color:var(--signal-red);">${d.time}s</span>` : ""}
    </p>
    <div class="card rv-card">
      ${c.concept ? `<div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">${esc(c.concept)}</div>` : ""}
      <div class="rv-q">${esc(c.question)}</div>
      <div id="rv-opts" style="display:grid;gap:8px;margin-top:16px;">
        <p style="color:var(--paper-400);font-size:13px;">AI 正在生成選項…</p>
      </div>
    </div>`;
  if (d.time) startTimer(d.time);
  try {
    const opts = await genOptions(c);
    renderBattleOpts(c, opts);
  } catch (e) {
    document.getElementById("rv-opts").innerHTML = `<p style="color:var(--signal-red);">選項生成失敗：${esc(e.message)}</p>`;
  }
}

function startTimer(sec) {
  clearInterval(battleTimer);
  timeLeft = sec;
  const el = document.getElementById("rv-timer");
  battleTimer = setInterval(() => {
    timeLeft--;
    if (el) el.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(battleTimer);
      battleAnswer(false, true);  // 超時算錯
    }
  }, 1000);
}

/* AI 生成 3 個干擾選項 */
async function genOptions(card) {
  const reply = await ask([
    { role: "system", content: "你是出題助手。用繁體中文回答，只給選項。" },
    { role: "user", content: `問題：${card.question}\n正確答案：${card.answer}\n請給 3 個錯誤但合理的干擾選項，每行一個，格式「- 選項內容」。不要編號，不要解釋。` },
  ], { max_tokens: 300 });
  const wrong = reply.split("\n").map(l => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 3);
  while (wrong.length < 3) wrong.push("以上皆非");
  const all = [...wrong, card.answer.trim()];
  /* 洗牌 */
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

function renderBattleOpts(card, opts) {
  const box = document.getElementById("rv-opts");
  if (!box) return;
  box.innerHTML = opts.map(o =>
    `<button class="q-opt" data-a="${esc(o)}">${esc(o)}</button>`).join("");
  box.querySelectorAll(".q-opt").forEach(b => {
    b.onclick = () => {
      clearInterval(battleTimer);
      const correct = b.dataset.a.trim() === card.answer.trim();
      /* 標記正確答案 */
      box.querySelectorAll(".q-opt").forEach(x => {
        if (x.dataset.a.trim() === card.answer.trim()) x.style.borderColor = "var(--signal-green)";
        x.disabled = true;
      });
      if (!correct) b.style.borderColor = "var(--signal-red)";
      setTimeout(() => battleAnswer(correct, false), 1200);
    };
  });
}

async function battleAnswer(correct, timeout) {
  clearInterval(battleTimer);
  const d = DIFF[difficulty];
  const c = cards[idx];
  let pts = 0;
  if (correct) {
    streak++;
    pts = d.pts + Math.min(streak - 1, 5) * 5;  // 連擊加成
    score += pts;
    toast(`答對！+${pts} 分（連擊 x${streak}）`);
  } else {
    if (difficulty === "hard") { score = Math.max(0, score - 10); }
    streak = 0;
    toast(timeout ? "時間到！" : "答錯了", false);
  }
  /* SM-2 更新：答對=記得(2)，答錯=忘記(0) */
  const upd = sm2(c, correct ? 2 : 0);
  try {
    await supabase.from("review_cards").update(upd).eq("id", c.id);
  } catch (e) {}
  done++;
  idx++;
  setTimeout(renderBattle, 300);
}

async function renderBattleDone() {
  /* 挑戰獎勵星砂：分數轉換 */
  const reward = Math.floor(score / 10);
  if (reward > 0) {
    try {
      const { data: prof } = await supabase.from("profiles").select("points").eq("id", user.id).single();
      await supabase.from("profiles").update({ points: (prof?.points || 0) + reward }).eq("id", user.id);
    } catch (e) {}
  }
  view.innerHTML = `
    <div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">BATTLE COMPLETE</div>
      <h2 style="margin-bottom:8px;">挑戰完成！</h2>
      <div style="font-size:48px;font-family:var(--font-mono);color:var(--brass-300);margin:16px 0;">${score}</div>
      <p style="color:var(--paper-400);">共複習 ${done} 張卡片 · 難度：${DIFF[difficulty].nm}</p>
      ${reward > 0 ? `<p style="color:var(--brass-300);margin-top:8px;">獲得 ${reward} 星砂</p>` : ""}
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
        <button class="btn btn-ghost" onclick="location.reload()">再來一次</button>
        <button class="btn btn-primary" onclick="location.href='learn.html'">回總覽</button>
      </div>
    </div>`;
}

/* ===== 心流模式（原有） ===== */
function render() {
  if (idx >= cards.length) return renderDone();
  const c = cards[idx];
  view.innerHTML = `
    <p style="margin-bottom:12px;color:var(--paper-400);font-size:13px;">
      <span class="rv-count">${idx + 1} / ${cards.length}</span> · 已完成 ${done}
    </p>
    <div class="card rv-card">
      ${c.concept ? `<div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">${esc(c.concept)}</div>` : ""}
      <div class="rv-q">${esc(c.question)}</div>
      <div class="rv-a hidden" id="rv-a">${esc(c.answer)}</div>
      <div id="rv-actions" style="margin-top:20px;">
        <button class="btn btn-primary" id="rv-show">顯示答案</button>
      </div>
    </div>`;
  document.getElementById("rv-show").onclick = () => {
    document.getElementById("rv-a").classList.remove("hidden");
    document.getElementById("rv-actions").innerHTML = `
      <div class="grade-row">
        <button class="btn btn-ghost" data-g="0">忘記</button>
        <button class="btn btn-ghost" data-g="1">模糊</button>
        <button class="btn btn-primary" data-g="2">記得</button>
      </div>`;
    view.querySelectorAll("[data-g]").forEach(b => {
      b.onclick = () => grade(Number(b.dataset.g));
    });
  };
}

async function grade(g) {
  const c = cards[idx];
  const upd = sm2(c, g);
  try {
    const { error } = await supabase.from("review_cards").update(upd).eq("id", c.id);
    if (error) throw error;
  } catch (e) {
    toast("儲存失敗：" + e.message);
  }
  done++;
  idx++;
  render();
}

function renderDone() {
  view.innerHTML = `
    <div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">COMPLETE</div>
      <h2 style="margin-bottom:8px;">今日複習完成</h2>
      <p style="color:var(--paper-400);">共複習 <span class="rv-count">${done}</span> 張卡片</p>
      <img class="rv-done-img" src="../assets/media-generation-dawn-v4-review-0-34f50cf7-9f3c-4f2e-990d-006589be067a.webp" alt="複習完成">
      <div style="margin-top:16px;"><button class="btn btn-ghost" onclick="location.href='learn.html'">回總覽</button></div>
    </div>`;
}

load();
