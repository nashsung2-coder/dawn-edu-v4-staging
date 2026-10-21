/* 星艦解碼：街機射擊答題遊戲（本地運行） */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, esc, ensureProfile, parseAIJson } from "../core/ui.js?v=theme001";
import { renderTypeHistory } from "../core/learn-history.js?v=sess002";
import { initKbSelector } from "../core/kb-selector.js";
import { chat, MODELS } from "../core/llm.js";
import { blocksText } from "../core/blocks.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

/* ===== 音效（Web Audio 合成，無需外部檔案） ===== */
let audioCtx = null;
function beep(freq, dur, type = "square") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch {}
}
const sfx = {
  shoot: () => beep(880, 0.08),
  hit: () => { beep(523, 0.12); setTimeout(() => beep(784, 0.15), 80); },
  wrong: () => beep(160, 0.3, "sawtooth"),
  boom: () => beep(80, 0.4, "sawtooth"),
  combo: (n) => beep(400 + n * 100, 0.1),
};

/* ===== 遊戲狀態 ===== */
const G = {
  running: false, paused: false, mode: "timed", conquest: null, topic: "",
  score: 0, combo: 0, maxCombo: 0, hp: 3,
  timeLeft: 60, level: 1, qIndex: 0,
  questions: [], current: null,
  ship: { x: W / 2, y: H - 60, w: 40, h: 30 },
  bullets: [], asteroids: [], particles: [], floaters: [],
  keys: {}, lastShot: 0,
};

/* ===== 題目生成（遊戲開始前批量，遊戲中不等待 AI） ===== */
/* 寶庫多選：選中的節點內容快取起來，出題時嚴格根據內容 */
let arcadeKbCache = [];
async function arcadeKbRef() {
  const parts = arcadeKbCache.filter(k => k.text)
    .map(k => `【${k.title}】\n${k.text.slice(0, 2500)}`).join("\n\n").slice(0, 5000);
  return parts
    ? `\n以下是曙光寶庫中使用者選取的節點內容，請**嚴格根據這些內容**出題，不要引入內容之外的知識：\n---\n${parts}\n---`
    : "";
}
async function fetchQuestions(topic, n = 20) {
  /* AI 偶發回傳壞 JSON，自動重試 3 次 */
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reply = await chat([
        { role: "system", content: "你是用繁體中文的出題老師。只回 JSON，不要其他文字。" },
        { role: "user", content: `主題「${topic}」，出 ${n} 題單選題，難度由淺入深。${await arcadeKbRef()}重要：每個選項必須在 8 個字以內（因為要顯示在遊戲隕石上）。題目、選項、解析中不要使用半形雙引號 "，如需引號請用「」。格式：[{"q":"題目","opts":["A","B","C","D"],"ans":0,"hint":"一句話解析"}]` },
      ], { model: MODELS.battle, max_tokens: 4000 });
      const questions = parseAIJson(reply, "[");
      if (!Array.isArray(questions) || !questions.length) throw new Error("題目解析失敗");
      return questions;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* ===== 實體 ===== */
function spawnQuestion() {
  if (G.qIndex >= G.questions.length) { endGame(true); return; }
  const q = G.questions[G.qIndex++];
  G.current = q;
  // 4 顆答案隕石，從上方隨機位置飛入
  const speedBase = 0.6 + G.level * 0.15;
  G.asteroids = q.opts.map((text, i) => ({
    text, correct: i === q.ans,
    x: 100 + i * 180 + Math.random() * 40,
    y: -40 - Math.random() * 60,
    vx: (Math.random() - 0.5) * 1.2,
    vy: speedBase + Math.random() * 0.5,
    r: 42, hp: 1,
  }));
}

function shoot() {
  const now = performance.now();
  if (now - G.lastShot < 180) return; // 射速限制
  G.lastShot = now;
  G.bullets.push({ x: G.ship.x, y: G.ship.y - 20, vy: -9, r: 4 });
  sfx.shoot();
}

function explode(x, y, color) {
  for (let i = 0; i < 18; i++) {
    G.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
      life: 30 + Math.random() * 20, color,
    });
  }
}

function addFloater(x, y, text, color = "#fff") {
  G.floaters.push({ x, y, text, life: 50, color });
}

/* ===== 碰撞與判定 ===== */
function checkCollisions() {
  // 子彈 vs 隕石
  for (let bi = G.bullets.length - 1; bi >= 0; bi--) {
    const b = G.bullets[bi];
    for (let ai = G.asteroids.length - 1; ai >= 0; ai--) {
      const a = G.asteroids[ai];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy < (a.r + b.r) * (a.r + b.r)) {
        G.bullets.splice(bi, 1);
        if (a.correct) {
          // 答對！
          G.combo++;
          G.maxCombo = Math.max(G.maxCombo, G.combo);
          const pts = 100 * G.combo;
          G.score += pts;
          explode(a.x, a.y, "#4ade80");
          addFloater(a.x, a.y, `+${pts}`, "#4ade80");
          if (G.combo >= 3) { addFloater(a.x, a.y - 30, `${G.combo} 連擊！`, "#fcd34d"); sfx.combo(G.combo); }
          else sfx.hit();
          // 顯示解析
          if (G.current.hint) addFloater(W / 2, 120, G.current.hint, "#93c5fd");
          G.asteroids = [];
          setTimeout(() => { if (G.running) spawnQuestion(); }, 900);
        } else {
          // 打錯！先標示正確答案讓玩家學到，再換題
          G.combo = 0;
          G.hp--;
          explode(a.x, a.y, "#f87171");
          addFloater(a.x, a.y, "答錯！", "#f87171");
          sfx.wrong();
          // 把正確答案標綠
          G.asteroids.forEach(ast => { if (ast.correct) ast.revealed = true; });
          G.bullets = []; // 清空子彈避免誤擊
          updateHUD();
          if (G.hp <= 0) { setTimeout(() => endGame(false), 1500); return; }
          setTimeout(() => { if (G.running) { G.asteroids = []; spawnQuestion(); } }, 1500);
        }
        break;
      }
    }
  }
  // 隕石 vs 星艦 / 飛出底部
  for (let i = G.asteroids.length - 1; i >= 0; i--) {
    const a = G.asteroids[i];
    // 撞到星艦
    const dx = a.x - G.ship.x, dy = a.y - G.ship.y;
    if (dx * dx + dy * dy < (a.r + 18) * (a.r + 18)) {
      G.asteroids.splice(i, 1);
      G.hp--; G.combo = 0;
      explode(G.ship.x, G.ship.y, "#f87171");
      sfx.boom(); updateHUD();
      if (G.hp <= 0) { endGame(false); return; }
    }
    // 飛出底部（正確答案飛走了 = 錯過）
    else if (a.y > H + 50) {
      G.asteroids.splice(i, 1);
      if (a.correct) {
        G.combo = 0;
        addFloater(W / 2, H / 2, "錯過正確答案！", "#fb923c");
      }
      if (!G.asteroids.length && G.running) setTimeout(() => { if (G.running) spawnQuestion(); }, 500);
    }
  }
}

/* ===== 更新 ===== */
function update(dt) {
  // 星艦移動
  if (G.keys["ArrowLeft"] && G.ship.x > 30) G.ship.x -= 6;
  if (G.keys["ArrowRight"] && G.ship.x < W - 30) G.ship.x += 6;
  if (G.keys[" "] || G.keys["ArrowUp"]) shoot();

  // 子彈
  G.bullets = G.bullets.filter(b => {
    b.y += b.vy;
    return b.y > -10;
  });

  // 隕石
  G.asteroids.forEach(a => {
    a.x += a.vx; a.y += a.vy;
    if (a.x < a.r || a.x > W - a.r) a.vx *= -1; // 左右反彈
  });

  // 粒子
  G.particles = G.particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.life--;
    return p.life > 0;
  });
  G.floaters = G.floaters.filter(f => { f.y -= 1; f.life--; return f.life > 0; });

  checkCollisions();

  // 限時模式計時
  if (G.mode === "timed") {
    G.timeLeft -= dt / 1000;
    if (G.timeLeft <= 0) { endGame(true); return; }
  }

  // 升級：每 5 題一級
  const newLevel = Math.floor(G.qIndex / 5) + 1;
  if (newLevel !== G.level) {
    G.level = newLevel;
    addFloater(W / 2, H / 2, `第 ${G.level} 關！速度提升`, "#fcd34d");
  }
}

/* ===== 繪製 ===== */
function draw() {
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, W, H);

  // 星空背景
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % W, y = (i * 89 + Date.now() * 0.02) % H;
    ctx.globalAlpha = 0.3 + (i % 3) * 0.2;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // 題目
  if (G.current) {
    ctx.fillStyle = "#0a0e1f";
    ctx.fillRect(0, 0, W, 70);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    // 自動換行
    const words = G.current.q;
    ctx.fillText(words.length > 30 ? words.slice(0, 30) + "…" : words, W / 2, 30);
    if (words.length > 30) ctx.fillText(words.slice(30, 60), W / 2, 52);
  }

  // 隕石（答案）
  G.asteroids.forEach(a => {
    // 隕石本體
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(a.x, a.y, 5, a.x, a.y, a.r);
    grad.addColorStop(0, "#475569");
    grad.addColorStop(1, "#1e293b");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = a.revealed ? "#4ade80" : "#64748b"; // 答錯後才揭示正確答案
    ctx.lineWidth = 2;
    ctx.stroke();
    // 答案文字
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    const t = a.text.length > 10 ? a.text.slice(0, 10) + "…" : a.text;
    ctx.fillText(t, a.x, a.y + 5);
  });

  // 星艦
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(G.ship.x, G.ship.y - 18);
  ctx.lineTo(G.ship.x - 16, G.ship.y + 14);
  ctx.lineTo(G.ship.x + 16, G.ship.y + 14);
  ctx.closePath();
  ctx.fill();
  // 引擎火焰
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.moveTo(G.ship.x - 6, G.ship.y + 14);
  ctx.lineTo(G.ship.x, G.ship.y + 24 + Math.random() * 8);
  ctx.lineTo(G.ship.x + 6, G.ship.y + 14);
  ctx.closePath();
  ctx.fill();

  // 子彈
  ctx.fillStyle = "#fcd34d";
  G.bullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 粒子
  G.particles.forEach(p => {
    ctx.globalAlpha = p.life / 50;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  });
  ctx.globalAlpha = 1;

  // 浮動文字
  ctx.textAlign = "center";
  G.floaters.forEach(f => {
    ctx.globalAlpha = Math.min(1, f.life / 25);
    ctx.fillStyle = f.color;
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
}

/* ===== HUD ===== */
function updateHUD() {
  document.getElementById("hud-score").textContent = `分數 ${G.score}`;
  document.getElementById("hud-combo").textContent = G.combo >= 2 ? `🔥${G.combo}連擊` : "";
  document.getElementById("hud-hp").textContent = "❤️".repeat(Math.max(0, G.hp)) || "💀";
  document.getElementById("hud-time").textContent = G.mode === "timed" ? `⏱️${Math.ceil(G.timeLeft)}s` : `Lv.${G.level}`;
}

/* ===== 遊戲循環 ===== */
let lastTime = 0;
function loop(t) {
  if (!G.running || G.paused) {
    if (G.paused) {
      // 繪製暫停畫面
      ctx.fillStyle = "oklch(0 0 0 / 0.7)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("已暫停", W / 2, H / 2);
      ctx.font = "14px sans-serif";
      ctx.fillText("按 P 繼續", W / 2, H / 2 + 40);
    }
    return;
  }
  const dt = t - lastTime;
  lastTime = t;
  update(Math.min(dt, 50));
  draw();
  updateHUD();
  requestAnimationFrame(loop);
}

/* ===== 開始/結束 ===== */
async function startGame(mode, topic) {
  const errEl = document.getElementById("arcade-err");
  errEl.style.display = "none";
  if (!topic.trim()) {
    errEl.textContent = "請先輸入主題";
    errEl.style.display = "block";
    return;
  }

  // 顯示載入
  document.getElementById("game-menu").innerHTML = `<p style="color:var(--paper-400);">AI 正在準備題目…</p>
    <div class="skeleton" style="height:20px;width:50%;margin:16px 0 12px;"></div>
    <div class="skeleton" style="height:44px;margin-bottom:10px;border-radius:12px;"></div>
    <div class="skeleton" style="height:44px;border-radius:12px;"></div>`;

  try {
    G.questions = await fetchQuestions(topic.trim(), 20);
    if (!G.questions.length) throw new Error("沒有題目");
  } catch (e) {
    document.getElementById("game-menu").innerHTML = `
      <p style="color:var(--signal-red);">題目準備失敗：${esc(e.message)}</p>
      <button class="btn btn-ghost" onclick="location.reload()">重試</button>`;
    return;
  }

  // 重置
  Object.assign(G, {
    running: true, mode, topic: topic.trim(),
    score: 0, combo: 0, maxCombo: 0, hp: 3,
    timeLeft: 60, level: 1, qIndex: 0,
    bullets: [], asteroids: [], particles: [], floaters: [],
    ship: { x: W / 2, y: H - 60, w: 40, h: 30 },
  });

  document.getElementById("game-menu").style.display = "none";
  document.getElementById("game-wrap").style.display = "block";

  spawnQuestion();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

async function endGame(completed) {
  G.running = false;
  // 儲存戰績
  try {
    const user = (await supabase.auth.getUser()).data.user;
    if (user) {
      await supabase.from("battle_records").insert({
        user_id: user.id,
        quiz_score: G.score,
        questions_answered: G.qIndex,
        max_combo: G.maxCombo,
        mode: `arcade_${G.mode}`,
      });
      // 征服模式：分數達標則佔領星球
      if (G.conquest && G.conquest.planet_id) {
        const threshold = 800; // 達標分數
        if (G.score >= threshold) {
          await supabase.from("planet_ownership").upsert({
            planet_id: G.conquest.planet_id,
            user_id: user.id,
            conquered_at: new Date().toISOString(),
          }, { onConflict: "planet_id" });
          await supabase.from("conquest_battles").insert({
            user_id: user.id,
            planet_id: G.conquest.planet_id,
            won: true,
            score: G.score,
          });
        } else {
          await supabase.from("conquest_battles").insert({
            user_id: user.id,
            planet_id: G.conquest.planet_id,
            won: false,
            score: G.score,
          });
        }
      }
      // 寫入學習歷程（帶 session，點開可看戰績、用相同主題再玩）
      try {
        const { logLearnHistory, refreshHistoryUI, createLearnSession, saveLearnSession, sessionLink } = await import("../core/learn-history.js?v=sess002");
        const sid = await createLearnSession(supabase, user.id, "街機", G.conquest?.name || G.topic || "星艦解碼");
        if (sid) {
          saveLearnSession(supabase, sid, {
            mode: G.mode, topic: G.topic || "",
            conquest: G.conquest?.name || "",
            score: G.score, qIndex: G.qIndex, maxCombo: G.maxCombo,
            done: true,
          });
        }
        await logLearnHistory(supabase, user.id, {
          type: "街機",
          topic: G.conquest?.name ? `征服 ${G.conquest.name}` : `星艦解碼・${G.mode === "survival" ? "生存" : "限時"}模式`,
          detail: `得分 ${G.score}・答題 ${G.qIndex}・最高連擊 ${G.maxCombo}`,
          link: sessionLink("arcade.html", sid),
        });
          await refreshHistoryUI(supabase, user.id);
  } catch {}
    }
  } catch (e) { console.error("儲存失敗:", e); }

  // 結算畫面
  ctx.fillStyle = "oklch(0 0 0 / 0.8)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fcd34d";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(completed ? "時間到！" : "遊戲結束", W / 2, H / 2 - 60);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "20px sans-serif";
  ctx.fillText(`分數：${G.score}`, W / 2, H / 2 - 10);
  ctx.fillText(`最高連擊：${G.maxCombo}`, W / 2, H / 2 + 25);
  ctx.fillText(`答題數：${G.qIndex}`, W / 2, H / 2 + 60);
  if (G.conquest && G.conquest.planet_id) {
    const won = G.score >= 800;
    ctx.fillStyle = won ? "#4ade80" : "#f87171";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(won ? `🎉 成功征服 ${G.conquest.name}！` : `征服失敗（需 800 分）`, W / 2, H / 2 + 95);
  }
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("點擊重新開始", W / 2, H / 2 + 110);

  canvas.onclick = () => location.reload();
  sfx.boom();
}

/* ===== 輸入 ===== */
window.addEventListener("keydown", e => {
  if (e.key === "p" || e.key === "P" || e.key === "Escape") {
    if (G.running) {
      G.paused = !G.paused;
      if (!G.paused) { lastTime = performance.now(); requestAnimationFrame(loop); }
    }
    return;
  }
  G.keys[e.key] = true;
  if ([" ", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
});
window.addEventListener("keyup", e => { G.keys[e.key] = false; });

// 觸控：拖曳移動，點擊射擊
let touchX = null;
canvas.addEventListener("touchstart", e => {
  touchX = e.touches[0].clientX;
  shoot();
}, { passive: true });
canvas.addEventListener("touchmove", e => {
  if (touchX === null) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches[0].clientX - rect.left) / rect.width * W;
  G.ship.x = Math.max(30, Math.min(W - 30, x));
}, { passive: true });
canvas.addEventListener("touchend", () => { touchX = null; });

// 滑鼠：移動跟隨，點擊射擊
canvas.addEventListener("mousemove", e => {
  if (!G.running) return;
  const rect = canvas.getBoundingClientRect();
  G.ship.x = Math.max(30, Math.min(W - 30, (e.clientX - rect.left) / rect.width * W));
});
canvas.addEventListener("click", () => { if (G.running) shoot(); });

/* ===== 初始化 ===== */
async function init() {
  await renderTopbar("arcade.html");
  const user = await requireAuth();
  try { renderTypeHistory(supabase, user.id, "arcade-history", "街機"); } catch {}
  /* 寶庫多選：之前 import 了但沒呼叫，導致選擇器空白 */
  try {
    await initKbSelector("arcade-kb", supabase, user.id, async (sel) => {
      if (!sel.length) { arcadeKbCache = []; return; }
      const inp = document.getElementById("arcade-topic");
      if (inp) inp.value = sel.map(s => s.title).join("、");
      const ids = new Set(sel.map(s => String(s.id)));
      arcadeKbCache = arcadeKbCache.filter(k => ids.has(String(k.id)));
      const missing = sel.filter(s => !arcadeKbCache.some(k => String(k.id) === String(s.id)));
      if (missing.length) {
        try {
          const { data } = await supabase.from("knowledge_nodes").select("id,title,content").in("id", missing.map(s => s.id));
          for (const s of missing) {
            const row = (data || []).find(r => String(r.id) === String(s.id));
            let txt = "";
            if (row) {
              try {
                const parsed = JSON.parse(row.content || "{}");
                txt = blocksText(parsed.blocks || (Array.isArray(parsed) ? parsed : []));
              } catch { txt = row.content || ""; }
            }
            arcadeKbCache.push({ id: s.id, title: s.title, text: (txt || "").trim() });
          }
        } catch {}
      }
    });
  } catch {}
  // 征服模式：從宇宙跳轉過來
  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "conquest") {
    try {
      const cq = JSON.parse(sessionStorage.getItem("arcade_conquest") || "{}");
      if (cq.theme) {
        document.getElementById("arcade-topic").value = cq.theme;
        G.conquest = cq;
        // 自動開始生存模式（征服戰）
        const menu = document.getElementById("game-menu");
        menu.querySelector("h1").textContent = `征服 ${cq.name || ""}`;
        // 隱藏模式選擇，只留一個開始按鈕
        menu.querySelectorAll(".mode-btn").forEach(b => b.style.display = "none");
        const startBtn = document.createElement("button");
        startBtn.className = "btn btn-primary mode-btn";
        startBtn.textContent = "🚀 開始征服戰";
        startBtn.onclick = () => startGame("survival", cq.theme);
        menu.appendChild(startBtn);
      }
    } catch {}
  }
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.onclick = () => startGame(btn.dataset.mode, document.getElementById("arcade-topic").value);
  });
  /* 從歷史點開：顯示上次戰績，可一鍵用相同主題再玩 */
  try {
    const sid = new URLSearchParams(location.search).get("session");
    if (sid) {
      const { loadLearnSession } = await import("../core/learn-history.js?v=sess002");
      const row = await loadLearnSession(supabase, sid, user.id);
      const st = row?.state;
      if (st && st.done) {
        const menu = document.getElementById("game-menu");
        const card = document.createElement("div");
        card.className = "card";
        card.style.cssText = "max-width:560px;margin:0 auto 16px;padding:16px;text-align:center;";
        card.innerHTML = `
          <div style="font-size:12px;color:var(--paper-400);margin-bottom:6px;">上次的街機戰績${st.conquest ? `・征服 ${esc(st.conquest)}` : ""}</div>
          <div style="font-size:28px;font-weight:700;color:var(--brass-300);">${st.score} 分</div>
          <div style="font-size:13px;color:var(--paper-400);margin:6px 0 12px;">答題 ${st.qIndex}・最高連擊 ${st.maxCombo}${st.topic ? `・主題：${esc(st.topic)}` : ""}</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn btn-primary btn-sm" id="arcade-replay">用相同主題再玩一次</button>
            <button class="btn btn-ghost btn-sm" id="arcade-dismiss">關閉</button>
          </div>`;
        menu.parentNode.insertBefore(card, menu);
        document.getElementById("arcade-replay").onclick = () => {
          const inp = document.getElementById("arcade-topic");
          if (inp && st.topic) inp.value = st.topic;
          card.remove();
          startGame(st.mode || "timed", st.topic || (inp ? inp.value : ""));
        };
        document.getElementById("arcade-dismiss").onclick = () => card.remove();
      }
    }
  } catch {}
}
// 導覽列加上街機入口（如果還沒有）
init();
