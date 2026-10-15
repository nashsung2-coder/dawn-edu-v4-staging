/* v4 主控台：學習總覽 + 遊戲成就 + 家庭狀態 */
import { supabase, getProfile } from "../core/supabase.js?v=fixed002";
import { renderTopbar, requireAuth, toast, esc, ensureProfile } from "../core/ui.js?v=fixed002";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + " 超時")), ms)),
  ]);
}

const view = document.getElementById("dash-view");

try {
  await withTimeout(renderTopbar("dashboard.html"), 15000, "載入導覽列");
  var user = await withTimeout(requireAuth(), 15000, "驗證登入");
  await withTimeout(ensureProfile(supabase, user), 15000, "建立使用者資料");
} catch (e) {
  view.innerHTML = `<div class="state-empty"><p>載入失敗：${esc(e.message)}</p><button class="btn btn-primary" onclick="location.reload()">重試</button></div>`;
  throw e;
}

const now = new Date().toISOString();
const todayStr = now.slice(0, 10);

const [profileR, dueR, battleR, nodesR, planetsR, petR] = await Promise.allSettled([
  getProfile(user.id),
  supabase.from("review_cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("next_review_at", now),
  supabase.from("battle_records").select("question, quiz_score, feynman_score, badge_name, badge_rarity, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  supabase.from("knowledge_nodes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  supabase.from("planet_ownership").select("planet_id", { count: "exact", head: true }).eq("user_id", user.id),
  supabase.from("pets").select("*").eq("user_id", user.id).limit(1).maybeSingle(),
]);

const profile = profileR.status === "fulfilled" ? profileR.value : null;
const dueCount = dueR.status === "fulfilled" ? (dueR.value.count ?? 0) : 0;
const battles = battleR.status === "fulfilled" ? (battleR.value.data || []) : [];
const nodeCount = nodesR.status === "fulfilled" ? (nodesR.value.count ?? 0) : 0;
const planetCount = planetsR.status === "fulfilled" ? (planetsR.value.count ?? 0) : 0;
const pet = petR.status === "fulfilled" ? petR.value : null;

/* ===== 學習總覽 ===== */
const todayBattles = battles.filter(b => (b.created_at || "").slice(0, 10) === todayStr);
const tasks = [
  { nm: "複習到期卡片", done: dueCount === 0, link: "review.html" },
  { nm: "費曼說服 1 次", done: todayBattles.some(b => Number(b.feynman_score) > 0), link: "feynman.html" },
  { nm: "知識對戰 1 場", done: todayBattles.some(b => Number(b.quiz_score) > 0), link: "quiz.html" },
];
const doneTasks = tasks.filter(t => t.done).length;
const fScores = battles.map(b => Number(b.feynman_score) || 0).filter(s => s > 0);
const fAvg = fScores.length ? Math.round(fScores.reduce((a, b) => a + b, 0) / fScores.length) : 0;

const learnHtml = `
<div class="dash-section-title"><span class="en">LEARN</span>學習總覽</div>
<div class="card">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
    <div style="font-weight:700;">${esc(profile?.name || "旅人")}</div>
    <div style="font-size:13px;color:var(--paper-400);"><span class="mono" style="color:var(--brass-300);">${(profile?.points ?? 0).toLocaleString()}</span> 星砂 · 今日任務 ${doneTasks}/3</div>
    <span style="flex:1"></span>
    <a class="btn btn-ghost btn-sm" href="learn.html">詳細 →</a>
  </div>
  ${tasks.map(t => `<a href="${t.link}" class="task-item" style="text-decoration:none;color:inherit;">
    <div class="task-check ${t.done ? "done" : ""}">${t.done ? "✓" : ""}</div>
    <div style="font-size:14px;">${esc(t.nm)}</div>
  </a>`).join("")}
  <div class="stat-row" style="margin-top:12px;">
    <div class="stat"><div class="num">${dueCount}</div><div class="lbl">到期複習</div></div>
    <div class="stat"><div class="num">${fAvg}%</div><div class="lbl">費曼平均</div></div>
    <div class="stat"><div class="num">${nodeCount}</div><div class="lbl">知識節點</div></div>
  </div>
</div>`;

/* ===== 遊戲成就 ===== */
const wins = battles.filter(b => (Number(b.quiz_score) || 0) >= 60).length;
const badges = battles.filter(b => b.badge_name);
const gameHtml = `
<div class="dash-section-title"><span class="en">GAME</span>遊戲成就</div>
<div class="card">
  <div class="stat-row">
    <div class="stat"><div class="num">${planetCount}</div><div class="lbl">佔領星球</div></div>
    <div class="stat"><div class="num">${battles.length}</div><div class="lbl">對戰場次</div></div>
    <div class="stat"><div class="num">${wins}</div><div class="lbl">勝利</div></div>
    <div class="stat"><div class="num">${badges.length}</div><div class="lbl">徽章</div></div>
  </div>
  <div class="quick-links" style="margin-top:12px;">
    <a class="btn btn-ghost" href="universe.html">宇宙征服</a>
    <a class="btn btn-ghost" href="island.html">群島</a>
    <a class="btn btn-ghost" href="quiz.html">知識對戰</a>
  </div>
</div>`;

/* ===== 家庭狀態 ===== */
const charNames = { scholar: "博學者", warrior: "勇者", explorer: "探險家", artist: "藝術家" };
const homeHtml = `
<div class="dash-section-title"><span class="en">HOME</span>家庭狀態</div>
<div class="card">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
    <div style="font-weight:700;">${esc(charNames[profile?.character] || "博學者")}</div>
    <div style="font-size:13px;color:var(--paper-400);">${esc(profile?.vehicle || "飛行書")} · ${esc(profile?.outfit || "學者長袍")}</div>
    <span style="flex:1"></span>
    <a class="btn btn-ghost btn-sm" href="home.html">我的家 →</a>
  </div>
  <div class="stat-row">
    <div class="stat" style="min-width:0;flex:1.4;display:flex;flex-direction:column;justify-content:center;">
      ${pet ? `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
        <span style="font-size:11px;color:var(--paper-400);letter-spacing:1px;">靈獸</span>
        <span style="font-size:15px;font-weight:700;color:#fcd34d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${esc(pet.name || "無名")} <span style="font-weight:400;font-size:11px;color:var(--paper-400);">Lv.${pet.level || 1}</span></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:12px;min-width:42px;">開心度</span>
        <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;">
          <div style="height:100%;width:${Math.min(100, Math.max(0, pet.mood ?? 80))}%;border-radius:4px;background:linear-gradient(90deg,#f472b6,#ec4899);"></div>
        </div>
        <span style="font-size:12px;font-weight:600;color:#f9a8d4;min-width:36px;text-align:right;">${Math.min(100, Math.max(0, Math.round(pet.mood ?? 80)))}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;min-width:42px;">健康度</span>
        <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;">
          <div style="height:100%;width:${Math.min(100, Math.max(0, pet.hunger ?? 100))}%;border-radius:4px;background:linear-gradient(90deg,#34d399,#10b981);"></div>
        </div>
        <span style="font-size:12px;font-weight:600;color:#6ee7b7;min-width:36px;text-align:right;">${Math.min(100, Math.max(0, Math.round(pet.hunger ?? 100)))}%</span>
      </div>
      ` : `<div class="num">無</div><div class="lbl">靈獸</div>`}
    </div>
    <div class="stat"><div class="num">${(profile?.points ?? 0).toLocaleString()}</div><div class="lbl">星砂</div></div>
    <div class="stat"><div class="num">${nodeCount}</div><div class="lbl">知識節點</div></div>
  </div>
  <div class="quick-links" style="margin-top:12px;">
    <a class="btn btn-ghost" href="home.html">我的家</a>
    <a class="btn btn-ghost" href="pet.html">靈獸</a>
    <a class="btn btn-ghost" href="market.html">商店</a>
  </div>
</div>`;

view.innerHTML = learnHtml + gameHtml + homeHtml;
