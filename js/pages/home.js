/* 我的家：個人學習小窩 — 統計、最近動態、快捷入口 */
import { supabase, getProfile } from "../core/supabase.js";
import { renderTopbar, requireAuth, esc, ensureProfile} from "../core/ui.js?v=theme002";

await renderTopbar("home.html");
const user = await requireAuth();
await ensureProfile(supabase, user);
const view = document.getElementById("h-view");

view.innerHTML = `<div class="skeleton" style="height:200px"></div>`;

try {
  const now = new Date().toISOString();
  const [profile, battles, cards, nodes] = await Promise.all([
    getProfile(user.id),
    supabase.from("battle_records").select("id").eq("user_id", user.id),
    supabase.from("review_cards").select("id").eq("user_id", user.id),
    supabase.from("knowledge_nodes").select("id").eq("user_id", user.id),
  ]);

  const pts = profile.points ?? 0;
  const battleCount = battles.data?.length ?? 0;
  const cardCount = cards.data?.length ?? 0;
  const nodeCount = nodes.data?.length ?? 0;

  /* 角色裝扮圖片 */
  const charImgs = {
    scholar: "../assets/onboarding/char-scholar.webp",
    warrior: "../assets/onboarding/char-warrior.webp",
    explorer: "../assets/onboarding/char-explorer.webp",
    artist: "../assets/onboarding/char-artist.webp",
  };
  const vehImgs = {
    book: "../assets/onboarding/veh-book.webp",
    rocket: "../assets/onboarding/veh-rocket.webp",
    ship: "../assets/onboarding/veh-ship.webp",
    broom: "../assets/onboarding/veh-broom.webp",
  };
  const outImgs = {
    robe: "../assets/onboarding/out-robe.webp",
    armor: "../assets/onboarding/out-armor.webp",
    cloak: "../assets/onboarding/out-cloak.webp",
    crown: "../assets/onboarding/out-crown.webp",
  };
  const charNames = { scholar: "博學者", warrior: "勇者", explorer: "探險家", artist: "藝術家" };
  const vehNames = { book: "飛行書", rocket: "火箭", ship: "知識艦", broom: "魔法掃帚" };
  const outNames = { robe: "學者長袍", armor: "戰鬥鎧甲", cloak: "夜行斗篷", crown: "智慧王冠" };

  const avatarHtml = `
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2>我的形象</h2>
        <a class="btn btn-ghost" href="onboarding.html" style="font-size:13px;">重新打扮</a>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="text-align:center;">
          <img src="${charImgs[profile?.character] || charImgs.scholar}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px;border:1px solid oklch(0.60 0.12 80 / 0.2);">
          <div style="font-size:13px;margin-top:6px;font-weight:700;">${charNames[profile?.character] || "博學者"}</div>
          <div class="label">角色</div>
        </div>
        <div style="text-align:center;">
          <img src="${vehImgs[profile?.vehicle] || vehImgs.book}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px;border:1px solid oklch(0.60 0.12 80 / 0.2);">
          <div style="font-size:13px;margin-top:6px;font-weight:700;">${vehNames[profile?.vehicle] || "飛行書"}</div>
          <div class="label">交通工具</div>
        </div>
        <div style="text-align:center;">
          <img src="${outImgs[profile?.outfit] || outImgs.robe}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px;border:1px solid oklch(0.60 0.12 80 / 0.2);">
          <div style="font-size:13px;margin-top:6px;font-weight:700;">${outNames[profile?.outfit] || "學者長袍"}</div>
          <div class="label">服裝</div>
        </div>
      </div>
      ${profile?.traits?.length ? `<div style="margin-top:12px;font-size:13px;color:var(--paper-400);">特質：${profile.traits.map(esc).join(" · ")}</div>` : ""}
    </div>`;

  /* 最近戰績 */
  const { data: recent } = await supabase.from("battle_records")
    .select("question, quiz_score, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  view.innerHTML = `
    ${avatarHtml}
    <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
      <div class="card" style="text-align:center;">
        <div class="label">星砂</div>
        <div class="num" style="font-size:28px;">${pts.toLocaleString()}</div>
      </div>
      <div class="card" style="text-align:center;">
        <div class="label">對戰場次</div>
        <div class="num" style="font-size:28px;">${battleCount}</div>
      </div>
      <div class="card" style="text-align:center;">
        <div class="label">複習卡片</div>
        <div class="num" style="font-size:28px;">${cardCount}</div>
      </div>
      <div class="card" style="text-align:center;">
        <div class="label">知識節點</div>
        <div class="num" style="font-size:28px;">${nodeCount}</div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-bottom:12px;">最近動態</h2>
      ${recent && recent.length ? recent.map(r => `
        <div style="padding:8px 0;border-bottom:1px solid var(--wash-06);display:flex;justify-content:space-between;">
          <span>${esc(r.question || "對戰")}</span>
          <span class="num-sm" style="color:var(--brass-400);">${r.quiz_score ?? 0} 分</span>
        </div>`).join("") : `<p style="color:var(--paper-400);">還沒有動態，去對戰一場吧！</p>`}
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 style="margin-bottom:12px;">快捷入口</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn btn-primary" href="feynman.html">費曼說服</a>
        <a class="btn btn-ghost" href="quiz.html">知識對戰</a>
        <a class="btn btn-ghost" href="review.html">複習</a>
        <a class="btn btn-ghost" href="island.html">島嶼</a>
        <a class="btn btn-ghost" href="pet.html">靈獸</a>
        <button class="btn btn-ghost" id="home-guide">平台導引</button>
      </div>
    </div>`;
  /* 平台導引：隨時可以重開來看 */
  try {
    document.getElementById("home-guide").onclick = async () => {
      const { showPlatformGuide } = await import("../core/guide.js?v=cr001");
      showPlatformGuide();
    };
  } catch {}
} catch (e) {
  view.innerHTML = `<div class="state-empty">
    <p>讀取失敗：${esc(e.message)}</p>
    <button class="btn btn-primary" onclick="location.reload()">重試</button></div>`;
}
