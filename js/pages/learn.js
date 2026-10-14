/* v4 學習總覽 */
import { supabase, getProfile } from "../core/supabase.js?v=fixed001";
import { renderTopbar, requireAuth, toast, esc, once, ensureProfile, ICO } from "../core/ui.js?v=fixed001";

/* timeout 保護：避免無限卡住 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + " 超時（" + ms + "ms）")), ms)),
  ]);
}

const view = document.getElementById("learn-view");
function errView(msg) {
  view.innerHTML = `<div class="state-empty">
    <p>${esc(msg)}</p>
    <button class="btn btn-primary" onclick="location.reload()">重試</button>
    <button class="btn" onclick="localStorage.clear();location.href='index.html'" style="margin-top:8px">清除登入重試</button></div>`;
}

try {
  await withTimeout(renderTopbar("learn.html"), 15000, "載入導覽列");
  var user = await withTimeout(requireAuth(), 15000, "驗證登入");
  await withTimeout(ensureProfile(supabase, user), 15000, "建立使用者資料");
} catch (e) {
  errView("載入失敗：" + e.message);
  throw e;
}

/* 首次引導：只顯示一次 */
once("dawn:v4:learn", () => `
  <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:8px;">WELCOME</div>
  <h2>第一次來？</h2>
  <ol>
    <li>去「費曼」用自己的話講概念</li>
    <li>去「對戰」找人 PK 賺徽章</li>
    <li>每天回來「複習」到期卡片</li>
  </ol>
  <button class="btn btn-primary" data-close>知道了</button>
`);


try {
  const now = new Date().toISOString();

  const [profileR, dueR, battleR] = await Promise.allSettled([
    getProfile(user.id),
    supabase.from("review_cards").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).lte("next_review_at", now),
    supabase.from("battle_records").select("question, quiz_score, feynman_score, badge_name, badge_rarity, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (profileR.status === "rejected") throw profileR.reason || new Error("讀取資料失敗");

  const dueCount = dueR.status === "fulfilled" ? (dueR.value.count ?? 0) : 0;
  const battles = battleR.status === "fulfilled" ? (battleR.value.data || []) : [];
  const profile = profileR.value;

  /* 角色圖片對應 */
  const charImgs = {
    scholar: "../assets/onboarding/char-scholar.webp",
    warrior: "../assets/onboarding/char-warrior.webp",
    explorer: "../assets/onboarding/char-explorer.webp",
    artist: "../assets/onboarding/char-artist.webp",
  };
  const charNames = { scholar: "博學者", warrior: "勇者", explorer: "探險家", artist: "藝術家" };
  const charImg = charImgs[profile?.character] || charImgs.scholar;

  /* 今日任務 */
  const todayStr = new Date().toISOString().slice(0, 10);
  const tasks = [
    { id: "review", nm: "複習到期卡片", desc: "複習之前學過的卡片，加深記憶", done: dueCount === 0, link: "review.html", icon: "nav-review.webp" },
    { id: "feynman", nm: "費曼說服 1 次", desc: "用自己的話解釋概念，AI 評估完整度", done: false, link: "feynman.html", icon: "nav-feynman.webp", check: "feynman" },
    { id: "quiz", nm: "知識對戰 1 場", desc: "AI 出題考你，答對得分賺星砂", done: false, link: "quiz.html", icon: "nav-quiz.webp", check: "quiz" },
  ];
  /* 檢查今日是否已完成費曼/對戰 */
  const todayBattles = battles.filter(b => (b.created_at || "").slice(0, 10) === todayStr);
  if (todayBattles.some(b => Number(b.feynman_score) > 0)) tasks[1].done = true;
  if (todayBattles.some(b => Number(b.quiz_score) > 0)) tasks[2].done = true;
  const doneTasks = tasks.filter(t => t.done).length;

  /* 費曼平均分 */
  const fScores = battles.map(b => Number(b.feynman_score) || 0).filter(s => s > 0);
  const fAvg = fScores.length ? (fScores.reduce((a, b) => a + b, 0) / fScores.length) : 0;

  /* 勝場（quiz_score >= 60 視為勝） */
  const wins = battles.filter(b => (Number(b.quiz_score) || 0) >= 60).length;
  const totalBattles = battles.length;
  const winRate = totalBattles ? Math.round(wins / totalBattles * 100) : 0;

  /* 本週費曼次數 */
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const weekFeynman = fScores.length; // 簡化：有分數即計次

  /* 主題掌握度：按 question 分組取費曼平均 */
  const topicMap = {};
  battles.forEach(b => {
    const t = (b.question || "未命名").slice(0, 20);
    if (!topicMap[t]) topicMap[t] = [];
    topicMap[t].push(Number(b.feynman_score) || 0);
  });
  const topics = Object.entries(topicMap)
    .map(([topic, scores]) => ({
      topic,
      mastery: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    }))
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 5);

  /* 徽章 */
  const badges = battles.filter(b => b.badge_name).slice(0, 6);

  const topicsHtml = topics.length
    ? `<table><tr><th>主題</th><th style="width:40%">掌握度</th><th style="text-align:right;">對戰</th></tr>
      ${topics.map(t => `<tr><td>${esc(t.topic)}</td>
        <td><div class="bar"><div style="width:${Math.min(100, t.mastery)}%"></div></div></td>
        <td class="n">${t.count}</td></tr>`).join("")}</table>`
    : `<div class="state-empty" style="padding:24px;"><p>還沒有對戰紀錄</p></div>`;

  /* 學習總覽主體 */
  const headerBanner = `
    <div class="card" style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:16px 20px;">
      <img src="${charImg}" alt="角色" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--brass-400);">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:16px;">${esc(profile?.name || "旅人")} <span style="font-size:12px;color:var(--paper-400);font-weight:400;">· ${charNames[profile?.character] || "博學者"}</span></div>
        <div style="font-size:13px;color:var(--paper-400);margin-top:4px;">
          <span class="mono" style="color:var(--brass-300);">${(profile?.points ?? 0).toLocaleString()}</span> 星砂
          <button id="ss-info" style="background:none;border:1px solid var(--brass-400);color:var(--brass-400);border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;margin-left:4px;" title="什麼是星砂？">?</button> ·
          今日任務 <span class="mono">${doneTasks}/3</span>
        </div>
      </div>
      <a class="btn btn-ghost" href="home.html" style="font-size:13px;">我的家</a>
    </div>`;

  const tasksHtml = `
    <div class="card span12" style="margin-bottom:0;">
      <h2 style="margin-bottom:12px;">今日任務 ${doneTasks === 3 ? `<img class="inline-ico" src="../assets/icons/icon-celebrate.webp" alt="" loading="lazy"> 全部完成！` : ""}</h2>
      ${doneTasks === 3 ? `<p style="color:var(--brass-300);font-size:13px;margin-bottom:12px;">太棒了！今日任務全破，明日再接再厲。</p>` : ""}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        ${tasks.map(t => `
          <a href="${t.link}" style="text-decoration:none;">
            <div class="opt-card ${t.done ? "sel" : ""}" style="padding:14px;text-align:center;">
              ${t.done
                ? `<div class="check-badge">${ICO.check}</div>`
                : `<img class="task-ico" src="../assets/icons/${t.icon}" alt="" loading="lazy">`}
              <div class="nm" style="${t.done ? "text-decoration:line-through;color:var(--paper-400);" : ""}">${t.nm}</div>
              <div class="ds" style="font-size:12px;">${t.desc}</div>
            </div>
          </a>`).join("")}
      </div>
    </div>`;

  const badgesHtml = badges.length
    ? badges.map(b => `<span class="seal" title="${esc(b.badge_name)}">${esc((b.badge_name || "?")[0])}</span>`).join("")
    : `<p class="label">還沒有徽章，去對戰贏一枚吧</p>`;

  view.innerHTML = `${headerBanner}<div class="grid">
    ${tasksHtml}
    <div class="card span4">
      <h2>今日複習</h2>
      <div class="num">${dueCount}<span style="font-size:16px;color:var(--paper-400)"> 張到期</span></div>
      <div style="margin-top:12px;"><a class="btn btn-primary" href="review.html">去複習</a></div>
    </div>
    <div class="card span4">
      <h2>費曼說服</h2>
      <div class="num">${fAvg.toFixed(1)}<span style="font-size:16px;color:var(--paper-400)">%</span></div>
      <div class="label">平均完整度 · 共 ${fScores.length} 次</div>
      <div style="margin-top:12px;"><a class="btn btn-ghost" href="feynman.html">開始</a></div>
    </div>
    <div class="card span4">
      <h2>對戰</h2>
      <div class="num">${wins}<span style="font-size:16px;color:var(--paper-400)">勝</span></div>
      <div class="label">勝率 ${winRate}% · 共 ${totalBattles} 場</div>
      <div style="margin-top:12px;"><a class="btn btn-ghost" href="quiz.html">開戰</a></div>
    </div>
    <div class="card span8">
      <h2>主題掌握度</h2>
      ${topicsHtml}
    </div>
    <div class="card span4">
      <h2>徽章</h2>
      <div>${badgesHtml}</div>
      <div class="label" style="margin-top:8px;">${badges.length} 枚</div>
    </div>
  </div>
  <!-- 星砂說明 Modal -->
  <div id="ss-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">
      <h2 style="margin-bottom:4px;"><img class="inline-ico" src="../assets/icons/icon-sparkle.webp" alt="" loading="lazy"> 星砂是什麼？</h2>
      <p style="color:var(--paper-400);font-size:13px;margin-bottom:16px;">曙光教育的通用貨幣，學習就能賺</p>
      <h3 style="font-size:14px;margin-bottom:8px;color:var(--brass-300);">怎麼賺</h3>
      <ul style="font-size:13px;line-height:2.4;margin-bottom:16px;padding-left:20px;list-style:none;">
        <li><img class="inline-ico" src="../assets/icons/nav-review.webp" alt="" loading="lazy"> <b>複習挑戰</b>：挑戰模式按分數給星砂</li>
        <li><img class="inline-ico" src="../assets/icons/nav-feynman.webp" alt="" loading="lazy"> <b>費曼說服</b>：完整度達標給獎勵</li>
        <li><img class="inline-ico" src="../assets/icons/nav-quiz.webp" alt="" loading="lazy"> <b>知識對戰</b>：勝利給獎勵</li>
        <li><img class="inline-ico" src="../assets/icons/nav-island.webp" alt="" loading="lazy"> <b>島嶼開拓</b>：每次 +20（每日 5 次）</li>
        <li><img class="inline-ico" src="../assets/icons/nav-universe.webp" alt="" loading="lazy"> <b>宇宙征服</b>：佔領星球給獎勵</li>
        <li><img class="inline-ico" src="../assets/icons/nav-pet.webp" alt="" loading="lazy"> <b>靈獸夥伴</b>：等級越高加成越多</li>
      </ul>
      <h3 style="font-size:14px;margin-bottom:8px;color:var(--brass-300);">能幹嘛</h3>
      <ul style="font-size:13px;line-height:2.4;margin-bottom:16px;padding-left:20px;list-style:none;">
        <li><img class="inline-ico" src="../assets/icons/nav-market.webp" alt="" loading="lazy"> <b>商店</b>：買武器、防具，強化宇宙戰力</li>
        <li><img class="inline-ico" src="../assets/icons/nav-universe.webp" alt="" loading="lazy"> <b>宇宙</b>：強力武器更容易征服星球</li>
      </ul>
      <button class="btn btn-primary" id="ss-close" style="width:100%;">知道了</button>
    </div>
  </div>`;
  /* 星砂說明按鈕 */
  document.getElementById("ss-info").onclick = () => {
    document.getElementById("ss-modal").style.display = "flex";
  };
  document.getElementById("ss-close").onclick = () => {
    document.getElementById("ss-modal").style.display = "none";
  };
  document.getElementById("ss-modal").addEventListener("click", e => {
    if (e.target.id === "ss-modal") e.target.style.display = "none";
  });
} catch (e) {
  console.error(e);
  errView("載入失敗，請重試");
}
