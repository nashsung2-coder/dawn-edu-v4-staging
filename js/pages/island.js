/* 島嶼 v6：知識庫群島 — 每個知識分類長出一座專屬島嶼。
   費曼說服與知識對戰是知識庫的附加品：它們的產出化為知識節點，滋養群島。 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile } from "../core/ui.js";

await renderTopbar("island.html");
const user = await requireAuth();
await ensureProfile(supabase, user);
const v = document.getElementById("v");

/* 分類 → 島嶼圖 */
const CAT_IMG = {
  "物理": "kb-physics.webp", "化學": "kb-chemistry.webp", "生物": "kb-biology.webp",
  "數學": "kb-math.webp", "歷史": "kb-history.webp", "地理": "kb-geography.webp",
  "公民": "kb-civics.webp", "公民與社會": "kb-civics.webp",
  "英文": "kb-english.webp", "英語": "kb-english.webp",
  "國文": "kb-chinese.webp", "國語文": "kb-chinese.webp",
};
const DEFAULT_IMG = "kb-generic.webp";
const PER_LEVEL = 5;
const LV_NAMES = ["迷霧", "沙洲", "小島", "豐島", "群島", "傳說之島"];

function levelOf(n) {
  return n <= 0 ? 0 : Math.min(5, Math.floor(n / PER_LEVEL) + 1);
}
const imgFor = (cat) => CAT_IMG[cat] || DEFAULT_IMG;

async function load() {
  v.innerHTML = `<div class="skeleton" style="height:240px"></div>`;
  try {
    const { data, error } = await supabase.from("knowledge_nodes")
      .select("id, category").eq("user_id", user.id);
    if (error) throw error;

    const groups = {};
    (data || []).forEach(n => {
      const c = (n.category || "未分類").trim() || "未分類";
      groups[c] = (groups[c] || 0) + 1;
    });
    const cats = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const totalNodes = (data || []).length;
    const totalLv = cats.reduce((s, [, n]) => s + levelOf(n), 0);

    if (!cats.length) {
      v.innerHTML = `<div class="card"><div class="state-empty">
        <img class="isl-img" src="../assets/islands/${DEFAULT_IMG}" alt="迷霧群島"
          style="max-width:420px;border-radius:8px;opacity:.6;" loading="lazy">
        <p style="margin:16px 0;">你的知識海域還是一片迷霧</p>
        <p style="font-size:13px;color:var(--paper-400);margin-bottom:16px;">
          去費曼說服解釋一個概念，或打一場知識對戰，<br>產出的知識節點會在這裡長成島嶼</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <a class="btn btn-primary" href="feynman.html">費曼說服</a>
          <a class="btn btn-ghost" href="quiz.html">知識對戰</a>
          <a class="btn btn-ghost" href="knowledge.html">知識庫</a>
        </div>
      </div></div>`;
      return;
    }

    v.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <div class="en" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;color:var(--brass-400);margin-bottom:4px;">KNOWLEDGE ARCHIPELAGO</div>
        <h2 style="margin-bottom:4px;">知識群島</h2>
        <div style="font-size:13px;color:var(--paper-400);">
          ${cats.length} 座島嶼 · ${totalNodes} 個知識節點 · 群島等級 <b class="mono" style="color:var(--brass-300);">${totalLv}</b>
        </div>
        <div style="font-size:12px;color:var(--paper-400);margin-top:8px;">
          費曼說服與知識對戰都是知識庫的附加品 — 它們的產出化為節點，滋養你的群島
        </div>
      </div>
      <div class="archipelago">
        ${cats.map(([cat, n], idx) => {
          const lv = levelOf(n);
          const nextAt = lv * PER_LEVEL;
          const prog = lv >= 5 ? 100 : Math.round((n / nextAt) * 100);
          return `
          <a href="knowledge.html?cat=${encodeURIComponent(cat)}" style="text-decoration:none;color:inherit;">
          <div class="isl-card lv${lv}" style="--d:${(idx % 3) * 14}px;">
            <div class="isl-img-wrap">
              <img class="isl-img" src="../assets/islands/${imgFor(cat)}" alt="${esc(cat)}之島" loading="lazy">
              <div class="isl-lv">Lv.${lv} · ${LV_NAMES[lv]}</div>
            </div>
            <div class="isl-body">
              <div class="isl-name">${esc(cat)}之島</div>
              <div style="font-size:12px;color:var(--paper-400);margin:4px 0;">
                <span class="mono" style="color:var(--brass-300);font-size:15px;">${n}</span> 個節點
              </div>
              ${lv < 5
                ? `<div class="bar" style="margin:6px 0;"><div style="width:${prog}%"></div></div>
                   <div style="font-size:11px;color:var(--paper-400);">距 Lv.${lv + 1} 還差 ${nextAt - n} 個節點</div>`
                : `<div style="font-size:12px;color:var(--brass-300);">已達最高等級</div>`}
            </div>
          </div></a>`;
        }).join("")}
      </div>
      <p style="text-align:center;font-size:12px;color:var(--paper-400);margin-top:16px;">
        點擊島嶼進入該知識庫 · 新分類會自動長出新島
      </p>`;
  } catch (err) {
    v.innerHTML = `<div class="state-empty">
      <p>讀取失敗：${esc(err.message)}</p>
      <button class="btn btn-primary" id="retry" style="margin-top:12px;">重試</button>
    </div>`;
    document.getElementById("retry").onclick = load;
  }
}

load();
