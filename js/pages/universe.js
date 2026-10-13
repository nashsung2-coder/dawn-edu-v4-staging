/* v4 宇宙遊戲：星球征服 MVP */
import { supabase } from "../core/supabase.js";
import { chat } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile, applyTimeBg, ICO } from "../core/ui.js";

applyTimeBg();
await renderTopbar("universe.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const svg = document.getElementById("star-map");
const panel = document.getElementById("uni-panel");

let planets = [];
let ownership = {};  // planet_id -> { user_id, name }

/* 載入星球與歸屬 */
async function load() {
  const { data: ps } = await supabase.from("planets").select("*").order("difficulty");
  planets = ps || [];
  const { data: os } = await supabase.from("planet_ownership").select("planet_id, user_id, profiles!inner(name)");
  ownership = {};
  (os || []).forEach(o => { ownership[o.planet_id] = o; });
  renderMap();
}

/* 渲染星空圖 */
function renderMap() {
  /* 星空背景星點 */
  let stars = "";
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() * 100).toFixed(1), y = (Math.random() * 100).toFixed(1);
    const r = (Math.random() * 0.25 + 0.08).toFixed(2);
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${(Math.random() * 0.5 + 0.2).toFixed(2)}"/>`;
  }
  /* 星球 */
  const nodes = planets.map(p => {
    const owned = ownership[p.id];
    const isMine = owned && owned.user_id === user.id;
    const r = 2.5 + p.difficulty * 0.8;
    return `<g class="planet ${owned ? "owned" : ""}" data-id="${p.id}">
      <circle cx="${p.x_pos}" cy="${p.y_pos}" r="${r + 0.6}" fill="none" stroke="${p.color}" stroke-width="0.15" opacity="0.4"/>
      <circle cx="${p.x_pos}" cy="${p.y_pos}" r="${r}" fill="url(#pg-${p.id})"/>
      <defs><radialGradient id="pg-${p.id}" cx="35%" cy="35%">
        <stop offset="0%" stop-color="${p.color}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${p.color}" stop-opacity="0.35"/>
      </radialGradient></defs>
      ${isMine ? `<image x="${p.x_pos - 1.7}" y="${p.y_pos - r - 5.2}" width="3.4" height="3.4" href="../assets/icons/icon-flag.webp"/><text x="${p.x_pos}" y="${p.y_pos - r - 1.2}" class="planet-label" fill="var(--brass-400)">我的</text>` : ""}
      ${owned && !isMine ? `<image x="${p.x_pos - 1.7}" y="${p.y_pos - r - 5.2}" width="3.4" height="3.4" href="../assets/icons/icon-flag.webp"/><text x="${p.x_pos}" y="${p.y_pos - r - 1.2}" class="planet-label">已佔領</text>` : ""}
      <text x="${p.x_pos}" y="${p.y_pos + r + 2.5}" class="planet-label">${esc(p.name)}</text>
    </g>`;
  }).join("");
  svg.innerHTML = stars + nodes;
  svg.querySelectorAll(".planet").forEach(el => {
    el.addEventListener("click", () => showPanel(el.dataset.id));
  });
}

/* 星球詳情面板 */
function showPanel(pid) {
  const p = planets.find(x => x.id === pid);
  if (!p) return;
  const owned = ownership[pid];
  const isMine = owned && owned.user_id === user.id;
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="${i < p.difficulty ? "" : "off"}">${ICO.star(i < p.difficulty)}</span>`).join("");
  panel.innerHTML = `
    <h3 style="margin-bottom:4px;">${esc(p.name)}</h3>
    <div class="diff-stars" style="margin-bottom:8px;">${stars}</div>
    <p style="font-size:13px;color:var(--paper-400);margin-bottom:8px;">主題：${esc(p.theme)}<br>${esc(p.description || "")}</p>
    <div style="font-size:13px;">守衛血量 <span class="mono">${p.max_hp}</span></div>
    <div class="hp-bar"><i style="width:100%"></i></div>
    <div style="font-size:13px;margin-bottom:12px;">獎勵：<span class="mono" style="color:var(--brass-300);">${p.reward_starsand}</span> 星砂</div>
    ${isMine
      ? `<p style="color:var(--brass-300);font-size:13px;"><img class="inline-ico" src="../assets/icons/icon-flag.webp" alt="" loading="lazy"> 這是你的星球</p>`
      : owned
        ? `<p style="color:var(--paper-400);font-size:13px;">已被 ${esc(owned.profiles?.name || "其他旅人")} 佔領</p>`
        : `<button class="btn btn-primary" id="btn-conquer" style="width:100%;">發起征服戰</button>`}
    <button class="btn btn-ghost" id="btn-close" style="width:100%;margin-top:8px;">關閉</button>
  `;
  panel.classList.add("show");
  document.getElementById("btn-close").onclick = () => panel.classList.remove("show");
  const bc = document.getElementById("btn-conquer");
  if (bc) bc.onclick = () => startBattle(p);
}

/* 征服戰鬥 */
async function startBattle(p) {
  panel.innerHTML = `
    <h3>${esc(p.name)} — 征服戰</h3>
    <p style="font-size:13px;color:var(--paper-400);">AI 正在生成 ${esc(p.theme)} 試煉…</p>
    <div class="battle-log" id="blog"></div>
  `;
  const blog = document.getElementById("blog");
  const log = (html, cls = "") => {
    blog.innerHTML += `<p class="${cls}">${html}</p>`;
    blog.scrollTop = blog.scrollHeight;
  };

  try {
    /* 讀取玩家最強武器攻擊力 */
    let atkBonus = 0;
    let bestWeapon = null;
    try {
      const { data: inv } = await supabase.from("inventory")
        .select("quantity, shop_items(name, atk)").eq("user_id", user.id);
      (inv || []).forEach(r => {
        const atk = Number(r.shop_items?.atk) || 0;
        if (atk > atkBonus) { atkBonus = atk; bestWeapon = r.shop_items?.name; }
      });
    } catch (_) {}
    if (bestWeapon) log(`裝備 <b>${esc(bestWeapon)}</b>，攻擊 +${atkBonus}`, "hit");

    /* AI 出題：3 題，主題相關（JSON 格式，跟對戰頁一致） */
    const reply = await chat([
      { role: "system", content: "你是出題老師。用繁體中文出 3 題單選題。只回 JSON 陣列，不要其他文字。格式：[{\"question\":\"題目\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"answer_index\":0}]" },
      { role: "user", content: `主題：${p.theme}（難度${p.difficulty}/5）` },
    ], { max_tokens: 1500 });

    const questions = parseQuestions(reply);
    if (!questions.length) throw new Error("題目解析失敗");

    let hp = p.max_hp;
    let correct = 0;
    /* 武器加成：每題傷害 = 基礎 + 攻擊力加成 */
    const baseDmg = Math.ceil(p.max_hp / questions.length);
    const dmgPerQ = baseDmg + Math.floor(atkBonus / 2);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const ok = await askQuestion(q, i + 1, questions.length, hp, p.max_hp);
      if (ok) {
        correct++;
        hp = Math.max(0, hp - dmgPerQ);
        log(`${ICO.check} 命中！造成 ${dmgPerQ} 點傷害，守衛剩餘血量 ${hp}`, "hit");
      } else {
        log(`${ICO.cross} 未命中，守衛反擊！`, "miss");
      }
      updateHpBar(hp, p.max_hp);
      if (hp <= 0) break;
    }

    const won = hp <= 0;
    /* 記錄戰鬥 */
    await supabase.from("conquest_battles").insert({
      user_id: user.id, planet_id: p.id, won,
      damage_dealt: p.max_hp - hp,
      questions_answered: questions.length, questions_correct: correct,
    });

    if (won) {
      /* 佔領 + 獎勵 */
      await supabase.from("planet_ownership").upsert(
        { planet_id: p.id, user_id: user.id }, { onConflict: "planet_id" });
      await supabase.rpc("transfer_starsand", {
        from_id: null, to_id: user.id, amount: p.reward_starsand, reason: `征服${p.name}`,
      }).then(r => r, async () => {
        /* RPC 不支援 null from，改直接加 */
        const { data: prof } = await supabase.from("profiles").select("points").eq("id", user.id).single();
        await supabase.from("profiles").update({ points: (prof?.points || 0) + p.reward_starsand }).eq("id", user.id);
      });
      log(`<img class="inline-ico" src="../assets/icons/icon-celebrate.webp" alt="" loading="lazy"> 征服成功！${esc(p.name)} 現在是你的領地，獲得 ${p.reward_starsand} 星砂！`, "hit");
      toast(`征服成功！+${p.reward_starsand} 星砂`);
    } else {
      log(`守衛血量剩餘 ${hp}，下次再接再厲！`);
      toast("征服失敗，再接再厲");
    }
    panel.innerHTML += `<button class="btn btn-primary" id="btn-done" style="width:100%;margin-top:12px;">完成</button>`;
    document.getElementById("btn-done").onclick = async () => {
      panel.classList.remove("show");
      await load();
    };
  } catch (e) {
    log(`戰鬥中斷：${esc(e.message)}`, "miss");
  }
}

function updateHpBar(hp, max) {
  const bar = panel.querySelector(".hp-bar i");
  if (bar) bar.style.width = `${(hp / max) * 100}%`;
}

/* 解析 AI 題目 */
function parseQuestions(text) {
  /* 先試 JSON 格式 */
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr) && arr.length) {
        const keys = ["A", "B", "C", "D"];
        return arr.map(q => ({
          q: q.question || "",
          opts: q.options || [],
          ans: keys[Number(q.answer_index)] || "A",
        })).filter(q => q.q && q.opts.length >= 2);
      }
    }
  } catch (_) {}
  /* 舊格式 fallback：Q:題目 / 選項 / 答案：X */
  const blocks = text.split(/\n\s*\n/);
  const qs = [];
  for (const b of blocks) {
    const qm = b.match(/Q[:：]\s*(.+)/);
    const am = b.match(/答案[:：]\s*([A-D])/i);
    if (!qm || !am) continue;
    const opts = [...b.matchAll(/([A-D])[)．.、]\s*([^\n]+)/g)].map(m => m[2].trim());
    if (opts.length < 2) continue;
    qs.push({ q: qm[1].trim(), opts, ans: am[1].toUpperCase() });
  }
  return qs;
}

/* 單題問答（用 confirm 式簡易 UI） */
function askQuestion(q, idx, total, hp, maxHp) {
  return new Promise(resolve => {
    const keys = ["A", "B", "C", "D"];
    panel.innerHTML = `
      <h3>第 ${idx} / ${total} 題</h3>
      <div style="font-size:13px;margin-bottom:8px;">守衛血量 <span class="mono">${hp}/${maxHp}</span></div>
      <div class="hp-bar"><i style="width:${(hp / maxHp) * 100}%"></i></div>
      <p style="margin:12px 0;font-size:14px;">${esc(q.q)}</p>
      <div style="display:grid;gap:8px;">
        ${q.opts.map((o, i) => `<button class="q-opt" data-k="${keys[i]}"><b>${keys[i]}</b> ${esc(o)}</button>`).join("")}
      </div>
    `;
    panel.querySelectorAll(".q-opt").forEach(b => {
      b.onclick = () => resolve(b.dataset.k === q.ans);
    });
  });
}

await load();
