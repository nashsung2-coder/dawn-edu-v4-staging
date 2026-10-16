/* 星艦解碼：街機射擊答題遊戲（本地運行） */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, esc, ensureProfile } from "../core/ui.js";
import { chat, MODELS } from "../core/llm.js";

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
  running: false, mode: "timed",
  score: 0, combo: 0, maxCombo: 0, hp: 3,
  timeLeft: 60, level: 1, qIndex: 0,
  questions: [], current: null,
  ship: { x: W / 2, y: H - 60, w: 40, h: 30 },
  bullets: [], asteroids: [], particles: [], floaters: [],
  keys: {}, lastShot: 0,
};

/* ===== 題目生成（遊戲開始前批量，遊戲中不等待 AI） ===== */
async function fetchQuestions(topic, n = 20) {
  const reply = await chat([
    { role: "system", content: "你是用繁體中文的出題老師。只回 JSON，不要其他文字。" },
    { role: "user", content: `主題「${topic}」，出 ${n} 題單選題，難度由淺入深。重要：每個選項必須在 8 個字以內（因為要顯示在遊戲隕石上）。格式：[{"q":"題目","opts":["A","B","C","D"],"ans":0,"hint":"一句話解析"}]` },
  ], { model: MODELS.battle, max_tokens: 4000 });
  const m = reply.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("題目解析失敗");
  return JSON.parse(m[0]);
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
          // 打錯！
          G.combo = 0;
          G.hp--;
          explode(a.x, a.y, "#f87171");
          addFloater(a.x, a.y, "答錯！", "#f87171");
          sfx.wrong();
          updateHUD();
          if (G.hp <= 0) { endGame(false); return; }
          G.asteroids = [];
          setTimeout(() => { if (G.running) spawnQuestion(); }, 900);
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
    ctx.strokeStyle = a.correct && false ? "#4ade80" : "#64748b"; // 不提示正確答案！
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
  if (!G.running) return;
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
  document.getElementById("game-menu").innerHTML = `<p style="color:var(--paper-400);">AI 正在準備題目…</p>`;

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
    running: true, mode,
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
    }
  } catch {}

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
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("點擊重新開始", W / 2, H / 2 + 110);

  canvas.onclick = () => location.reload();
  sfx.boom();
}

/* ===== 輸入 ===== */
window.addEventListener("keydown", e => {
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
  await requireAuth();
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.onclick = () => startGame(btn.dataset.mode, document.getElementById("arcade-topic").value);
  });
}
// 導覽列加上街機入口（如果還沒有）
init();
