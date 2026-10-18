/* 個人書架 v4：textbook_entries 列表，點擊展開全文 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, esc, ensureProfile, toast } from "../core/ui.js?v=fixed002";

await renderTopbar("bookshelf.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const v = document.getElementById("v");
let allEntries = [];
let searchQ = "";

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "numeric", day: "numeric" }); }
  catch { return ""; }
}

function renderEntries() {
  let entries = allEntries;
  if (searchQ) {
    const q = searchQ.toLowerCase();
    entries = entries.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.topic || "").toLowerCase().includes(q) ||
      (e.user_voice_summary || "").toLowerCase().includes(q));
  }
  if (!entries.length) {
    v.innerHTML = `<div class="state-empty">
      <p>${searchQ ? "沒有符合的條目" : "書架是空的"}</p>
      ${!searchQ ? `<a class="btn btn-primary" style="margin-top:12px;" href="feynman.html">去學習</a>` : ""}
    </div>`;
    return;
  }
  /* 按主題分組 */
  const groups = {};
  entries.forEach(e => {
    const t = e.topic || "未分類";
    if (!groups[t]) groups[t] = [];
    groups[t].push(e);
  });
  v.innerHTML = Object.entries(groups).map(([topic, list]) => `
    <h3 style="margin:20px 0 12px;font-size:15px;color:var(--brass-300);"><img class="inline-ico" src="../assets/icons/nav-bookshelf.webp" alt="" loading="lazy"> ${esc(topic)} <span style="color:var(--paper-400);font-weight:400;">(${list.length})</span></h3>
    ${list.map(e => {
      const title = e.title || e.topic || "未命名條目";
      const summary = (e.user_voice_summary || "").slice(0, 160);
      const tags = (e.key_points || []).map(k => `<span class="tag">${esc(k)}</span>`).join("");
      return `<div class="card entry" data-id="${e.id}" style="margin-bottom:10px;">
        <div class="title">${esc(title)}</div>
        ${summary ? `<div class="summary">${esc(summary)}${(e.user_voice_summary || "").length > 160 ? "…" : ""}</div>` : ""}
        ${tags ? `<div class="tags">${tags}</div>` : ""}
        <div class="full">
          ${e.user_voice_summary ? `<h4>我的話</h4><p>${esc(e.user_voice_summary)}</p>` : ""}
          ${e.ai_supplement ? `<h4>AI 補充</h4><p>${esc(e.ai_supplement)}</p>` : ""}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="date">${fmtDate(e.created_at)}</div>
          <button class="btn btn-ghost btn-sm" data-del="${e.id}" style="color:var(--signal-red);">刪除</button>
        </div>
      </div>`;
    }).join("")}
  `).join("");
  v.querySelectorAll(".entry").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-del]")) return;
      el.classList.toggle("open");
    });
  });
  v.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("確定刪除這個條目嗎？")) return;
      btn.disabled = true;
      try {
        const { error } = await supabase.from("textbook_entries")
          .delete().eq("id", btn.dataset.del).eq("user_id", user.id);
        if (error) throw error;
        allEntries = allEntries.filter(x => String(x.id) !== String(btn.dataset.del));
        renderEntries();
      } catch (err) {
        alert("刪除失敗：" + err.message);
        btn.disabled = false;
      }
    });
  });
}

async function load() {
  v.innerHTML = `<div class="skeleton" style="height:120px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:120px"></div>`;
  try {
    const { data, error } = await supabase.from("textbook_entries")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    allEntries = data || [];

    if (!allEntries.length) {
      v.innerHTML = `<div class="state-empty">
        <img class="empty-img" src="../assets/media-generation-dawn-v4-empty-library-0-41c0436d-9294-463c-9aaf-34d458cb7df2.webp" alt="空書架">
        <p>書架是空的。去學習（思辨對話、知識對戰、情境學習、AI 閱讀），AI 會幫你整理成書架條目。</p>
        <a class="btn btn-primary" style="margin-top:12px;" href="feynman.html">去學習</a>
      </div>`;
      return;
    }

    /* 搜尋框 */
    const searchBar = document.createElement("div");
    searchBar.className = "search-row";
    searchBar.style.marginBottom = "8px";
    searchBar.innerHTML = `
      <input class="input" id="bs-q" type="search" placeholder="搜尋標題、主題或內容…" style="flex:1;">
      <button class="btn btn-primary" id="bs-go">搜尋</button>`;
    v.before(searchBar);
    const qEl = document.getElementById("bs-q");
    document.getElementById("bs-go").onclick = () => { searchQ = qEl.value.trim(); renderEntries(); };
    qEl.addEventListener("keydown", e => { if (e.key === "Enter") { searchQ = qEl.value.trim(); renderEntries(); } });

    renderEntries();
  } catch (err) {
    v.innerHTML = `<div class="state-empty">
      <p>讀取失敗：${esc(err.message)}</p>
      <button class="btn btn-primary" id="retry" style="margin-top:12px;">重試</button>
    </div>`;
    document.getElementById("retry").onclick = load;
  }
}

load();
