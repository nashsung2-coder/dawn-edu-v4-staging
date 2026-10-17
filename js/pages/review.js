/* v4 複習：SM-2 間隔重複 + 挑戰模式（對戰化） */
import { supabase, getUser } from "../core/supabase.js";
import { ask } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js?v=fixed002";

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
/* FSRS-4.5 簡化版：取代 SM-2
 * 核心改進：三參數記憶模型（穩定度/難度/可提取性），消除 SM-2 的 ease hell
 * grade: 1=忘記(Again) 2=困難(Hard) 3=記得(Good) 4=輕鬆(Easy)
 */
// 保守調校版權重（避免間隔膨脹過快）
const FSRS_W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 0.8, 0.3, 0.5, 1.2, 0.2, 0.3, 0.8, 0.7, 1.5];
const FSRS_RETRIEVABILITY = 0.9; // 目標記憶保留率

function fsrs(card, grade) {
  // grade 0（舊 SM-2 的忘記）映射為 FSRS 的 1（Again）
  if (grade < 1) grade = 1;
  if (grade > 4) grade = 4;
  // 初始化或讀取參數
  let D = Number(card.fsrs_difficulty) || 5.0;  // 難度 1-10
  let S = Number(card.fsrs_stability) || 1.0;  // 穩定度（天）
  const now = new Date();

  // 計算上次複習至今的天數
  let elapsed = 1;
  if (card.last_review_at) {
    elapsed = Math.max(1, Math.round((now - new Date(card.last_review_at)) / 86400000));
  }

  // 可提取性 R = e^(-t/S)
  const R = Math.exp(-elapsed / S);

  // 更新難度：D' = D - w6 * (G - 3)
  const G = grade; // 1-4
  let newD = D - FSRS_W[6] * (G - 3);
  // 難度變化阻尼
  newD = D + (newD - D) * 0.5;
  newD = Math.max(1, Math.min(10, newD));

  // 更新穩定度
  let newS;
  if (G === 1) {
    // 忘記：穩定度大幅下降
    newS = FSRS_W[11] * Math.pow(D, -FSRS_W[12]) * Math.pow(S, FSRS_W[13]) * Math.exp(FSRS_W[14] * (1 - R));
    newS = Math.max(0.1, Math.min(S, newS));
  } else {
    // 記得：穩定度增長
    const hardPenalty = G === 2 ? FSRS_W[15] : 1;
    const easyBonus = G === 4 ? FSRS_W[16] : 1;
    newS = S * (1 + Math.exp(FSRS_W[8]) * (11 - D) * Math.pow(S, -FSRS_W[9]) * Math.exp((1 - R) * FSRS_W[10]) * hardPenalty * easyBonus);
  }
  newS = Math.max(0.1, Math.min(365, newS));

  // 計算下次間隔：I = S * ln(R_target) / ln(0.9)
  // 目標保留率 90%
  let interval = Math.round(newS * Math.log(FSRS_RETRIEVABILITY) / Math.log(0.9));
  // 新卡或忘記的卡最短間隔
  if (G === 1) interval = 1;
  else interval = Math.max(1, Math.min(365, interval));

  // 首次學習的特殊處理
  if (!card.last_review_at) {
    if (G === 1) interval = 1;
    else if (G === 2) interval = 1;
    else if (G === 3) interval = 3;
    else interval = 4;
    newS = [0.5, 1.0, 2.0, 3.0][G - 1] || 1.0;
  }

  const next = new Date(now);
  next.setDate(next.getDate() + interval);

  return {
    fsrs_difficulty: Math.round(newD * 100) / 100,
    fsrs_stability: Math.round(newS * 100) / 100,
    interval_days: interval,
    last_review_at: now.toISOString(),
    next_review_at: next.toISOString(),
    // 保留舊欄位以相容
    ease_factor: 2.5, repetitions: 0,
  };
}
// 別名保持調用處不變
const sm2 = fsrs;

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
    // 後台預生成所有選項，複習時不用等 AI
    pregenOptions(cards);
  } catch (e) {
    view.innerHTML = `<div class="card"><p style="color:var(--signal-red);">載入失敗：${esc(e.message)}</p>
      <button class="btn btn-ghost" style="margin-top:12px;" onclick="location.reload()">重試</button></div>`;
  }
}

/* 模式 + 難度選擇 */
/* 無到期卡片時：顯示各庫精熟度儀表板 */
async function renderMasteryDashboard() {
  view.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto;text-align:center;">
    <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">ALL CAUGHT UP</div>
    <h2>今日無到期卡片</h2>
    <p style="color:var(--paper-400);">載入各庫精熟度…</p></div>`;
  try {
    // 查所有知識節點（按分類統計）
    const { data: nodes } = await supabase.from("knowledge_nodes")
      .select("category").eq("user_id", user.id);
    // 查所有複習卡片（含 FSRS 數據算精熟度）
    const { data: allCards } = await supabase.from("review_cards")
      .select("category, fsrs_stability, fsrs_difficulty").eq("user_id", user.id);

    // 按分類聚合
    const cats = {};
    (nodes || []).forEach(n => {
      const cat = n.category || "未分類";
      if (!cats[cat]) cats[cat] = { nodes: 0, cards: 0, stabilitySum: 0, stabilityN: 0 };
      cats[cat].nodes++;
    });
    (allCards || []).forEach(cd => {
      const cat = cd.category || "未分類";
      if (!cats[cat]) cats[cat] = { nodes: 0, cards: 0, stabilitySum: 0, stabilityN: 0 };
      cats[cat].cards++;
      if (cd.fsrs_stability) { cats[cat].stabilitySum += cd.fsrs_stability; cats[cat].stabilityN++; }
    });

    const catNames = Object.keys(cats);
    if (!catNames.length) {
      view.innerHTML = `<div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
        <h2>今日無到期卡片</h2>
        <p style="color:var(--paper-400);">還沒有學習紀錄，去學點新東西吧！</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="location.href='learn.html'">去學習</button></div></div>`;
      return;
    }

    // 精熟度 = 平均 stability 映射到 0-100（stability 上限 180 天）
    const rows = catNames.map(cat => {
      const d = cats[cat];
      const avgStab = d.stabilityN ? d.stabilitySum / d.stabilityN : 0;
      const mastery = Math.min(100, Math.round(avgStab / 180 * 100));
      return { cat, ...d, mastery };
    }).sort((a, b) => a.mastery - b.mastery); // 最不熟的排前面

    // 找出最需要加強的
    const weakest = rows[0];
    const aiTip = weakest.mastery < 30
      ? `「${weakest.cat}」還很不熟（精熟度 ${weakest.mastery}%），建議優先加強`
      : weakest.mastery < 70
      ? `「${weakest.cat}」正在進步中（精熟度 ${weakest.mastery}%），繼續保持`
      : `各庫都掌握得不錯！可以挑戰新領域了`;

    view.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto;">
      <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">MASTERY</div>
      <h2 style="text-align:center;">各庫精熟度</h2>
      <p style="text-align:center;color:var(--paper-400);font-size:13px;margin-bottom:16px;">${aiTip}</p>
      ${rows.map(r => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="font-weight:600;">${esc(r.cat)}</span>
              <span style="color:var(--brass-400);font-size:13px;">${r.mastery}%</span>
            </div>
            <div style="height:8px;background:var(--bg-3);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${r.mastery}%;background:linear-gradient(90deg,var(--brass-500),var(--brass-300));border-radius:4px;transition:width .5s;"></div>
            </div>
            <div style="font-size:11px;color:var(--paper-400);margin-top:4px;">${r.nodes} 個節點 · ${r.cards} 張卡片</div>
          </div>
          <button class="btn btn-ghost" style="padding:6px 14px;font-size:12px;flex-shrink:0;"
            onclick="location.href='knowledge.html?cat=${encodeURIComponent(r.cat)}'">進入</button>
        </div>`).join("")}
      <div style="text-align:center;margin-top:20px;">
        <button class="btn btn-primary" onclick="location.href='learn.html'">去學習新內容</button>
      </div></div>`;
  } catch (e) {
    view.innerHTML = `<div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
      <h2>今日無到期卡片</h2>
      <p style="color:var(--paper-400);">去學習新內容，系統會自動產生複習卡片</p>
      <div style="margin-top:16px;"><button class="btn btn-primary" onclick="location.href='learn.html'">去學習</button></div></div>`;
  }
}

function renderModeSelect() {
  if (!cards.length) {
    renderMasteryDashboard();
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
    // 優先用預生成的，沒有才即時生成
    const opts = c._opts || await genOptions(c);
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

/* 後台批量預生成選項（並行，不阻塞 UI） */
async function pregenOptions(cardList) {
  // 限制並行數避免打爆 API
  const batch = 3;
  for (let i = 0; i < cardList.length; i += batch) {
    const slice = cardList.slice(i, i + batch);
    await Promise.all(slice.map(async (card) => {
      if (card._opts) return; // 已有就跳過
      try {
        card._opts = await genOptions(card);
      } catch { /* 失敗時用時再生成 */ }
    }));
  }
}

/* AI 生成 3 個干擾選項 */
async function genOptions(card) {
  const reply = await ask([
    { role: "system", content: "你是出題助手，專精迷思概念診斷。用繁體中文回答。" },
    { role: "user", content: `問題：${card.question}\n正確答案：${card.answer}\n請給 3 個干擾選項，每個必須對應一個學生常見的迷思概念或錯誤推理（不是隨便編的錯答案）。每行一個，格式「- 選項內容」。不要編號，不要解釋。` },
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
  /* SM-2 更新：超時=1（模糊），答錯=0（忘記），答對=3（記得），連擊3+=4（輕鬆） */
  const grade = timeout ? 1 : correct ? (streak >= 3 ? 4 : 3) : 0;
  const upd = sm2(c, grade);
  try {
    await supabase.from("review_cards").update(upd).eq("id", c.id);
  } catch (e) {}
  done++;
  idx++;
  // 記錄複習日誌（學習頁今日任務用）
  try {
    await supabase.from("review_logs").insert({ user_id: user.id, card_id: c.id, grade });
  } catch {}
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
      <div style="margin-top:12px;">
        <label style="font-size:12px;color:var(--paper-400);display:block;margin-bottom:6px;">先寫下你記得的內容（研究證實：打出來比用想的效果好兩倍）</label>
        <textarea class="input" id="rv-recall" rows="2" placeholder="在這裡打字回答…" style="width:100%;"></textarea>
      </div>
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
    await supabase.from("review_logs").insert({ user_id: user.id, card_id: c.id, grade: g });
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
