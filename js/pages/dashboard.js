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
// 學習目標（從 localStorage 讀取，用戶可在設定中修改）
let learningGoals = [];
try { learningGoals = JSON.parse(localStorage.getItem("learning_goals") || "[]"); } catch {}
const tasks = [
  {
    nm: "複習到期卡片",
    desc: dueCount > 0 ? `還有 ${dueCount} 張卡片等你複習，鞏固記憶` : "今日複習已完成，記憶曲線穩定",
    done: dueCount === 0, link: "review.html",
    progress: dueCount === 0 ? 100 : 0
  },
  {
    nm: "費曼說服 1 次",
    desc: "用自己的話解釋一個概念，挑戰 AI",
    done: todayBattles.some(b => Number(b.feynman_score) > 0), link: "feynman.html",
    progress: todayBattles.some(b => Number(b.feynman_score) > 0) ? 100 : 0
  },
  {
    nm: "知識對戰 1 場",
    desc: "與 AI 對戰，測試你的知識掌握度",
    done: todayBattles.some(b => Number(b.quiz_score) > 0), link: "quiz.html",
    progress: todayBattles.some(b => Number(b.quiz_score) > 0) ? 100 : 0
  },
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
  <div style="font-size:12px;color:var(--paper-400);margin-bottom:8px;letter-spacing:1px;">今日任務 ${doneTasks}/3</div>
  ${tasks.map(t => `<a href="${t.link}" class="task-item" style="text-decoration:none;color:inherit;display:block;margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="task-check ${t.done ? "done" : ""}">${t.done ? "✓" : ""}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${esc(t.nm)}</div>
        <div style="font-size:12px;color:var(--paper-400);margin-top:2px;">${esc(t.desc)}</div>
      </div>
      <div style="font-size:12px;color:${t.done ? "#6ee7b7" : "var(--paper-400)"};min-width:36px;text-align:right;">${t.progress}%</div>
    </div>
    <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.06);margin-top:6px;margin-left:34px;overflow:hidden;">
      <div style="height:100%;width:${t.progress}%;border-radius:2px;background:${t.done ? "linear-gradient(90deg,#34d399,#10b981)" : "rgba(255,255,255,0.15)"};transition:width 0.3s;"></div>
    </div>
  </a>`).join("")}
  ${learningGoals.length ? `
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
    <div style="font-size:12px;color:var(--paper-400);margin-bottom:8px;letter-spacing:1px;">我的學習目標</div>
    ${learningGoals.map(g => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:13px;">🎯</span>
      <span style="font-size:13px;flex:1;">${esc(g.text)}</span>
      <span style="font-size:11px;color:var(--paper-400);">${esc(g.progress || "")}</span>
    </div>`).join("")}
  </div>` : `
  <div style="margin-top:12px;">
    <a href="settings.html" style="font-size:12px;color:var(--brass-300);text-decoration:none;">＋ 設定學習目標</a>
  </div>`}
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

view.innerHTML = learnHtml + gameHtml + homeHtml + `
<div class="dash-section-title"><span class="en">FOR YOU</span>為你推薦</div>
<div class="card" id="ai-recommend-card">
  <p style="font-size:13px;color:var(--paper-400);">AI 正在分析你的學習軌跡…</p>
</div>`;

// AI 推薦：根據學習活動推薦知識節點
(async () => {
  try {
    const { ask } = await import("../core/llm.js?v=fixed002");
    // 取得公開知識節點
    const { data: nodes } = await supabase.from("knowledge_nodes")
      .select("id, title, category").eq("is_public", true)
      .order("created_at", { ascending: false }).limit(20);
    if (!nodes || !nodes.length) {
      document.getElementById("ai-recommend-card").innerHTML = `<p style="font-size:13px;color:var(--paper-400);">尚無公開知識節點可推薦</p>`;
      return;
    }
    // 用戶學習軌跡摘要
    const recentCats = battles.slice(0, 5).map(b => b.question || "").join("；").slice(0, 200);
    const goals = learningGoals.map(g => g.text).join("、");
    const reply = await ask(
      `你是學習推薦引擎。用繁體中文，根據學生的學習軌跡，從知識庫中推薦 3 個最適合他的節點。
輸出格式：每行一個，格式為「標題 | 推薦理由（一句話）」
只輸出 3 行，不要其他內容。`,
      `學生學習目標：${goals || "未設定"}\n近期學習：${recentCats || "無"}\n\n可推薦的知識節點：\n${nodes.map((n, i) => `${i + 1}. ${n.title}（${n.category || "未分類"}）`).join("\n")}`
    );
    const recs = reply.split("\n").filter(l => l.trim()).slice(0, 3);
    const recHtml = recs.map(line => {
      const [title, reason] = line.split("|").map(s => s.trim());
      const node = nodes.find(n => n.title === title.replace(/^\d+\.\s*/, ""));
      const link = node ? `node.html?id=${node.id}` : "knowledge.html";
      return `<a href="${link}" style="display:block;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);text-decoration:none;color:inherit;">
        <div style="font-size:14px;font-weight:600;color:var(--paper-200);">${esc(title.replace(/^\d+\.\s*/, ""))}</div>
        <div style="font-size:12px;color:var(--paper-400);margin-top:4px;">${esc(reason || "")}</div>
      </a>`;
    }).join("");
    document.getElementById("ai-recommend-card").innerHTML = recHtml || `<p style="font-size:13px;color:var(--paper-400);">暫無推薦</p>`;
  } catch (e) {
    document.getElementById("ai-recommend-card").innerHTML = `<p style="font-size:13px;color:var(--paper-400);">推薦暫時無法使用</p>`;
  }
})();
