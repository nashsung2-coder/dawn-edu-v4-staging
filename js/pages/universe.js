/* v4 宇宙遊戲：星球征服 — 完整可玩版 */
import { supabase } from "../core/supabase.js";
import { chat, MODELS } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile, applyTimeBg, ICO } from "../core/ui.js?v=theme002";

applyTimeBg();
await renderTopbar("universe.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const svg = document.getElementById("star-map");
const panel = document.getElementById("uni-panel");
const statsBar = document.getElementById("uni-stats");

let planets = [];
let ownership = {};
let myStats = { planets: 0, battles: 0, wins: 0, starsand: 0 };

/* ===== 載入 ===== */
async function load() {
  const { data: ps } = await supabase.from("planets").select("*").order("difficulty");
  planets = ps || [];
  const { data: os } = await supabase.from("planet_ownership").select("planet_id, user_id, profiles!inner(name)");
  ownership = {};
  (os || []).forEach(o => { ownership[o.planet_id] = o; });
  await loadStats();
  renderMap();
  renderStats();
}

async function loadStats() {
  const { data: battles } = await supabase.from("conquest_battles")
    .select("won, damage_dealt").eq("user_id", user.id);
  const { data: prof } = await supabase.from("profiles").select("points").eq("id", user.id).single();
  const myPlanets = Object.values(ownership).filter(o => o.user_id === user.id).length;
  myStats = {
    planets: myPlanets,
    battles: (battles || []).length,
    wins: (battles || []).filter(b => b.won).length,
    starsand: prof?.points || 0,
  };
}

function renderStats() {
  const winRate = myStats.battles ? Math.round(myStats.wins / myStats.battles * 100) : 0;
  statsBar.innerHTML = `
    <div class="stat"><span class="stat-v">${myStats.planets}</span><span class="stat-l">我的星球</span></div>
    <div class="stat"><span class="stat-v">${myStats.battles}</span><span class="stat-l">征服戰</span></div>
    <div class="stat"><span class="stat-v">${winRate}%</span><span class="stat-l">勝率</span></div>
    <div class="stat"><span class="stat-v" style="color:var(--brass-300);">${myStats.starsand}</span><span class="stat-l">星砂</span></div>
    <button class="btn btn-ghost btn-sm" id="btn-history" style="margin-left:auto;">戰鬥紀錄</button>
  `;
  document.getElementById("btn-history").onclick = showHistory;
}

/* ===== 星空圖 ===== */
function renderMap() {
  let stars = "";
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() * 100).toFixed(1), y = (Math.random() * 100).toFixed(1);
    const r = (Math.random() * 0.25 + 0.08).toFixed(2);
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${(Math.random() * 0.5 + 0.2).toFixed(2)}"/>`;
  }
  const nodes = planets.map(p => {
    const owned = ownership[p.id];
    const isMine = owned && owned.user_id === user.id;
    const r = 2.5 + p.difficulty * 0.8;
    // 難度顏色：1-2 綠、3 黃、4-5 紅
    const diffColor = p.difficulty <= 2 ? "#4ade80" : p.difficulty === 3 ? "#facc15" : "#f87171";
    return `<g class="planet ${owned ? "owned" : ""}" data-id="${p.id}">
      <circle cx="${p.x_pos}" cy="${p.y_pos}" r="${r + 0.6}" fill="none" stroke="${p.color}" stroke-width="0.15" opacity="0.4"/>
      <circle cx="${p.x_pos}" cy="${p.y_pos}" r="${r}" fill="url(#pg-${p.id})"/>
      <defs><radialGradient id="pg-${p.id}" cx="35%" cy="35%">
        <stop offset="0%" stop-color="${p.color}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${p.color}" stop-opacity="0.35"/>
      </radialGradient></defs>
      <circle cx="${p.x_pos + r * 0.7}" cy="${p.y_pos - r * 0.7}" r="0.9" fill="${diffColor}" opacity="0.9">
        <title>難度 ${p.difficulty}/5</title>
      </circle>
      ${isMine ? `<text x="${p.x_pos}" y="${p.y_pos - r - 1.5}" class="planet-label" fill="var(--brass-400)" font-weight="bold">★ 我的領地</text>` : ""}
      ${owned && !isMine ? `<text x="${p.x_pos}" y="${p.y_pos - r - 1.5}" class="planet-label" opacity="0.6">已被佔領</text>` : ""}
      <text x="${p.x_pos}" y="${p.y_pos + r + 2.5}" class="planet-label">${esc(p.name)}</text>
    </g>`;
  }).join("");
  svg.innerHTML = stars + nodes;
  svg.querySelectorAll(".planet").forEach(el => {
    el.addEventListener("click", () => showPanel(el.dataset.id));
  });
}

/* ===== 星球詳情 ===== */
function showPanel(pid) {
  const p = planets.find(x => x.id === pid);
  if (!p) return;
  const owned = ownership[pid];
  const isMine = owned && owned.user_id === user.id;
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span style="${i < p.difficulty ? "" : "opacity:0.25"}">★</span>`).join("");
  // 推薦難度：根據勝率
  const winRate = myStats.battles ? myStats.wins / myStats.battles : 0.5;
  const recDiff = winRate > 0.7 ? 4 : winRate > 0.4 ? 3 : 2;
  const isRecommended = !owned && Math.abs(p.difficulty - recDiff) <= 1;

  panel.innerHTML = `
    <h3 style="margin-bottom:4px;">${esc(p.name)} ${isRecommended ? '<span style="font-size:11px;background:var(--brass-400);color:#000;padding:2px 8px;border-radius:10px;">推薦</span>' : ""}</h3>
    <div class="diff-stars" style="margin-bottom:8px;color:var(--brass-400);">${stars} <span style="font-size:11px;color:var(--paper-400);">難度 ${p.difficulty}/5</span></div>
    <p style="font-size:13px;color:var(--paper-400);margin-bottom:8px;">主題：${esc(p.theme)}<br>${esc(p.description || "")}</p>
    <div style="font-size:13px;">守衛血量 <span class="mono">${p.max_hp}</span></div>
    <div class="hp-bar"><i style="width:100%"></i></div>
    <div style="font-size:13px;margin-bottom:12px;">獎勵：<span class="mono" style="color:var(--brass-300);">${p.reward_starsand}</span> 星砂</div>
    ${isMine
      ? `<p style="color:var(--brass-300);font-size:13px;">★ 這是你的領地</p>`
      : owned
        ? `<p style="color:var(--paper-400);font-size:13px;">已被 ${esc(owned.profiles?.name || "其他旅人")} 佔領<br><span style="font-size:12px;">打贏了可以搶過來！</span></p>
           <button class="btn btn-primary" id="btn-conquer" style="width:100%;">挑戰佔領者</button>`
        : `<button class="btn btn-primary" id="btn-conquer" style="width:100%;">發起征服戰</button>`}
    <button class="btn btn-ghost" id="btn-close" style="width:100%;margin-top:8px;">關閉</button>
  `;
  panel.classList.add("show");
  document.getElementById("btn-close").onclick = () => panel.classList.remove("show");
  const bc = document.getElementById("btn-conquer");
  if (bc) bc.onclick = () => {
    // 跳轉到街機遊戲進行征服戰（內在整合：射擊答題）
    try {
      sessionStorage.setItem("arcade_conquest", JSON.stringify({ planet_id: p.id, theme: p.theme, name: p.name }));
    } catch {}
    location.href = "arcade.html?mode=conquest";
  };
}

/* ===== 征服戰鬥（重寫：題目+日誌同屏） ===== */
async function startBattle(p) {
  // 戰鬥狀態
  const battle = {
    planet: p,
    hp: p.max_hp,
    questions: [],
    current: 0,
    correct: 0,
    atkBonus: 0,
    bestWeapon: null,
    dmgPerQ: 0,
  };

  panel.innerHTML = `
    <h3>${esc(p.name)} — 征服戰</h3>
    <div style="font-size:13px;margin-bottom:8px;">守衛血量 <span class="mono" id="battle-hp-text">${p.max_hp}/${p.max_hp}</span></div>
    <div class="hp-bar"><i id="battle-hp-bar" style="width:100%"></i></div>
    <div id="battle-question"></div>
    <div class="battle-log" id="battle-log" style="max-height:150px;"></div>
    <button class="btn btn-ghost btn-sm" id="btn-retreat" style="width:100%;margin-top:8px;">撤退</button>
  `;
  panel.classList.add("show");
  document.getElementById("btn-retreat").onclick = () => {
    if (confirm("確定要撤退嗎？進度會消失。")) panel.classList.remove("show");
  };

  const logEl = document.getElementById("battle-log");
  const log = (html, cls = "") => {
    logEl.innerHTML += `<p class="${cls}">${html}</p>`;
    logEl.scrollTop = logEl.scrollHeight;
  };
  const updateHp = () => {
    document.getElementById("battle-hp-bar").style.width = `${(battle.hp / p.max_hp) * 100}%`;
    document.getElementById("battle-hp-text").textContent = `${battle.hp}/${p.max_hp}`;
  };

  try {
    // 武器加成
    try {
      const { data: inv } = await supabase.from("inventory")
        .select("quantity, shop_items(name, atk)").eq("user_id", user.id);
      (inv || []).forEach(r => {
        const atk = Number(r.shop_items?.atk) || 0;
        if (atk > battle.atkBonus) { battle.atkBonus = atk; battle.bestWeapon = r.shop_items?.name; }
      });
    } catch (_) {}
    if (battle.bestWeapon) {
      log(`裝備 <b>${esc(battle.bestWeapon)}</b>，每題傷害 +${Math.floor(battle.atkBonus / 2)}`, "hit");
    } else {
      log(`未裝備武器，前往商店購買可提升傷害`, "");
    }

    // AI 出題（帶重試）
    log(`AI 正在生成 ${esc(p.theme)} 試煉…`);
    let questions = [];
    for (let attempt = 0; attempt < 3 && !questions.length; attempt++) {
      try {
        const reply = await chat([
          { role: "system", content: "你是出題老師。用繁體中文出 3 題單選題，難度適中。只回 JSON 陣列，不要其他文字。格式：[{\"question\":\"題目\",\"options\":[\"選項A\",\"選項B\",\"選項C\",\"選項D\"],\"answer_index\":0,\"explanation\":\"簡短解析\"}]" },
          { role: "user", content: `主題：${p.theme}（難度${p.difficulty}/5），請出 3 題。` },
        ], { model: MODELS.battle, max_tokens: 2000 });
        questions = parseQuestions(reply);
      } catch (e) {
        if (attempt === 2) throw new Error("AI 出題失敗，請稍後再試");
      }
    }
    if (!questions.length) throw new Error("題目解析失敗，請重試");

    battle.questions = questions;
    const baseDmg = Math.ceil(p.max_hp / questions.length);
    battle.dmgPerQ = baseDmg + Math.floor(battle.atkBonus / 2);
    log(`試煉開始！共 ${questions.length} 題`, "hit");

    // 逐題戰鬥
    for (let i = 0; i < questions.length; i++) {
      battle.current = i;
      const result = await askQuestionUI(battle, questions[i], i);
      if (result.correct) {
        battle.correct++;
        battle.hp = Math.max(0, battle.hp - battle.dmgPerQ);
        log(`${ICO.check} 第${i + 1}題命中！造成 ${battle.dmgPerQ} 點傷害`, "hit");
      } else {
        log(`${ICO.cross} 第${i + 1}題未命中${result.gaveUp ? "（跳過）" : "，正確答案是 " + result.correctAns}`, "miss");
      }
      updateHp();
      if (battle.hp <= 0) break;
      await new Promise(r => setTimeout(r, 800)); // 間隔
    }

    await finishBattle(battle, log);
  } catch (e) {
    log(`戰鬥中斷：${esc(e.message)}`, "miss");
    document.getElementById("battle-question").innerHTML =
      `<button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="location.reload()">重新整理</button>`;
  }
}

/* 單題 UI（不替換整個面板） */
function askQuestionUI(battle, q, idx) {
  return new Promise(resolve => {
    const qEl = document.getElementById("battle-question");
    const keys = ["A", "B", "C", "D"];
    qEl.innerHTML = `
      <div style="background:var(--wash-04);border-radius:10px;padding:14px;margin:12px 0;">
        <div style="font-size:12px;color:var(--paper-400);margin-bottom:8px;">第 ${idx + 1} / ${battle.questions.length} 題</div>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">${esc(q.q)}</p>
        <div style="display:grid;gap:8px;">
          ${q.opts.map((o, i) => `
            <button class="q-opt" data-k="${keys[i]}" style="text-align:left;padding:10px 12px;border-radius:8px;border:1px solid var(--wash-12);background:transparent;color:var(--paper-100);cursor:pointer;font-size:13px;">
              <b style="color:var(--brass-300);">${keys[i]}</b> ${esc(o)}
            </button>`).join("")}
        </div>
        ${q.explanation ? `<div id="q-explain" style="display:none;margin-top:10px;padding:10px;background:oklch(0.74 0.14 80/0.08);border-radius:8px;font-size:13px;"></div>` : ""}
      </div>
    `;
    // hover 效果
    qEl.querySelectorAll(".q-opt").forEach(b => {
      b.onmouseover = () => b.style.borderColor = "var(--brass-400)";
      b.onmouseout = () => b.style.borderColor = "";
      b.onclick = () => {
        const correct = b.dataset.k === q.ans;
        // 標記正確/錯誤
        qEl.querySelectorAll(".q-opt").forEach(x => {
          x.disabled = true;
          x.style.cursor = "default";
          if (x.dataset.k === q.ans) {
            x.style.borderColor = "#4ade80";
            x.style.background = "rgba(74,222,128,0.1)";
          } else if (x === b && !correct) {
            x.style.borderColor = "var(--signal-red)";
            x.style.background = "rgba(248,113,113,0.1)";
          } else {
            x.style.opacity = "0.5";
          }
        });
        // 顯示解析
        const exEl = document.getElementById("q-explain");
        if (exEl && q.explanation) {
          exEl.style.display = "block";
          exEl.innerHTML = `<strong>解析：</strong>${esc(q.explanation)}`;
        }
        setTimeout(() => resolve({ correct, correctAns: q.ans, gaveUp: false }), 1500);
      };
    });
  });
}

/* 戰鬥結算 */
async function finishBattle(battle, log) {
  const p = battle.planet;
  const won = battle.hp <= 0;

  // 記錄戰鬥
  try {
    await supabase.from("conquest_battles").insert({
      user_id: user.id, planet_id: p.id, won,
      damage_dealt: p.max_hp - battle.hp,
      questions_answered: battle.questions.length,
      questions_correct: battle.correct,
    });
    // 同步到 battle_records：學習頁戰績統計
    const totalQ = battle.questions.length || 1;
    await supabase.from("battle_records").insert({
      user_id: user.id,
      question: `宇宙征服：${p.name || "未知星球"}`,
      quiz_score: Math.round((battle.correct / totalQ) * 100),
      feynman_score: 0,
    });
  } catch (_) {}

  document.getElementById("battle-question").innerHTML = "";
  document.getElementById("btn-retreat").style.display = "none";

  if (won) {
    // 佔領
    try {
      await supabase.from("planet_ownership").upsert(
        { planet_id: p.id, user_id: user.id }, { onConflict: "planet_id" });
    } catch (_) {}
    // 獎勵星砂
    try {
      const { data: prof } = await supabase.from("profiles").select("points").eq("id", user.id).single();
      await supabase.from("profiles").update({ points: (prof?.points || 0) + p.reward_starsand }).eq("id", user.id);
    } catch (_) {}

    log(`🎉 征服成功！`, "hit");
    document.getElementById("battle-question").innerHTML = `
      <div style="text-align:center;padding:20px;background:linear-gradient(135deg,oklch(0.74 0.14 80/0.15),oklch(0.74 0.14 80/0.05));border-radius:12px;margin:12px 0;">
        <div style="font-size:48px;margin-bottom:8px;">🏆</div>
        <div style="font-size:18px;font-weight:700;color:var(--brass-300);margin-bottom:8px;">${esc(p.name)} 是你的了！</div>
        <div style="font-size:14px;color:var(--paper-200);">答對 ${battle.correct}/${battle.questions.length} 題</div>
        <div style="font-size:14px;color:var(--brass-300);margin-top:8px;">+${p.reward_starsand} 星砂</div>
      </div>
      <button class="btn btn-primary" id="btn-done" style="width:100%;">返回星圖</button>
    `;
    toast(`征服成功！+${p.reward_starsand} 星砂`);
  } else {
    const dmgNeeded = battle.hp;
    document.getElementById("battle-question").innerHTML = `
      <div style="text-align:center;padding:20px;background:var(--wash-03);border-radius:12px;margin:12px 0;">
        <div style="font-size:40px;margin-bottom:8px;">💔</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;">征服失敗</div>
        <div style="font-size:13px;color:var(--paper-400);">答對 ${battle.correct}/${battle.questions.length} 題<br>守衛還剩 ${dmgNeeded} 血量</div>
        <div style="font-size:13px;color:var(--paper-400);margin-top:8px;">💡 提示：去商店買武器，或先複習 ${esc(p.theme)} 相關知識</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" id="btn-done" style="flex:1;">返回星圖</button>
        <button class="btn btn-primary" id="btn-retry" style="flex:1;">再戰一次</button>
      </div>
    `;
    toast("征服失敗，再接再厲");
    document.getElementById("btn-retry").onclick = () => startBattle(p);
  }
  document.getElementById("btn-done").onclick = async () => {
    panel.classList.remove("show");
    await load();
  };
}

/* ===== 戰鬥紀錄 ===== */
async function showHistory() {
  const { data } = await supabase.from("conquest_battles")
    .select("won, damage_dealt, questions_correct, questions_answered, created_at, planets(name)")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);

  panel.innerHTML = `
    <h3>戰鬥紀錄</h3>
    ${(data || []).length ? (data.map(b => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--wash-06);font-size:13px;">
        <span style="font-size:18px;">${b.won ? "🏆" : "💔"}</span>
        <div style="flex:1;">
          <div>${esc(b.planets?.name || "未知星球")}</div>
          <div style="font-size:11px;color:var(--paper-400);">
            ${b.questions_correct}/${b.questions_answered} 題 · ${new Date(b.created_at).toLocaleDateString("zh-TW")}
          </div>
        </div>
        <span style="color:${b.won ? "var(--brass-300)" : "var(--paper-400)"};font-size:12px;">
          ${b.won ? "勝利" : "失敗"}
        </span>
      </div>`).join("")) : `<p style="font-size:13px;color:var(--paper-400);">還沒有戰鬥紀錄，去征服第一顆星球吧！</p>`}
    <button class="btn btn-ghost" id="btn-close" style="width:100%;margin-top:12px;">關閉</button>
  `;
  panel.classList.add("show");
  document.getElementById("btn-close").onclick = () => panel.classList.remove("show");
}

/* ===== 題目解析 ===== */
function parseQuestions(text) {
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr) && arr.length) {
        const keys = ["A", "B", "C", "D"];
        return arr.map(q => ({
          q: q.question || "",
          opts: (q.options || []).slice(0, 4),
          ans: keys[Number(q.answer_index)] || "A",
          explanation: q.explanation || "",
        })).filter(q => q.q && q.opts.length >= 2);
      }
    }
  } catch (_) {}
  // fallback：舊格式
  const blocks = text.split(/\n\s*\n/);
  const qs = [];
  for (const b of blocks) {
    const qm = b.match(/Q[:：]\s*(.+)/);
    const am = b.match(/答案[:：]\s*([A-D])/i);
    if (!qm || !am) continue;
    const opts = [...b.matchAll(/([A-D])[)．.、]\s*([^\n]+)/g)].map(m => m[2].trim());
    if (opts.length < 2) continue;
    qs.push({ q: qm[1].trim(), opts, ans: am[1].toUpperCase(), explanation: "" });
  }
  return qs;
}

await load();
