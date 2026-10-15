/* 知識節點獨立閱讀頁：像電子書/部落格一樣打開 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, ensureProfile } from "../core/ui.js?v=fixed002";
// 本地定義 esc，不依賴 ui.js 導出
const htmlEsc = (s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])));
import { renderBlocks, blocksText } from "../core/blocks.js?v=fixed002";

await renderTopbar("knowledge.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const view = document.getElementById("node-view");
const params = new URLSearchParams(location.search);
const nodeId = params.get("id");

if (!nodeId) {
  view.innerHTML = `<div class="state-empty"><p>找不到節點 ID</p><a href="knowledge.html" class="btn btn-primary">返回知識庫</a></div>`;
} else {
  try {
    const { data: n, error } = await supabase.from("knowledge_nodes")
      .select("id,user_id,title,content,category,is_public,created_at").eq("id", nodeId).single();
    if (error || !n) throw new Error("找不到這個節點");

    let blocks = [];
    let question = "";
    try {
      const parsed = JSON.parse(n.content || "{}");
      if (parsed.blocks) { blocks = parsed.blocks; question = parsed.question || ""; }
      else if (Array.isArray(parsed)) blocks = parsed;
    } catch {}

    const date = n.created_at ? new Date(n.created_at).toLocaleDateString("zh-TW") : "";
    view.innerHTML = `
      <article class="card" style="padding:32px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
          <span class="status-badge ${n.is_public ? "status-published" : "status-draft"}">${n.is_public ? "公開" : "私人"}</span>
          <span style="font-size:12px;padding:4px 12px;border-radius:20px;background:oklch(0.75 0.15 80 / 0.15);color:var(--brass-300);">${htmlEsc(n.category || "未分類")}</span>
          ${date ? `<span style="font-size:12px;color:var(--paper-400);">${date}</span>` : ""}
        </div>
        <h1 style="font-size:24px;margin-bottom:8px;line-height:1.4;">${htmlEsc(n.title)}</h1>
        ${question ? `<p style="font-size:15px;color:var(--brass-300);margin-bottom:20px;line-height:1.7;">${htmlEsc(question)}</p>` : ""}
        <div style="border-top:1px solid oklch(1 0 0 / 0.08);margin:16px 0;"></div>
        <div class="blocks-content">${blocks.length ? renderBlocks(blocks, htmlEsc) : `<p style="color:var(--paper-400);">${htmlEsc(n.content || "")}</p>`}</div>
        <div style="border-top:1px solid oklch(1 0 0 / 0.08);margin:24px 0 16px;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="node-verify">開始驗證對戰</button>
          ${String(n.user_id) === String(user.id) ? `<a href="node-editor.html?id=${n.id}" class="btn btn-ghost btn-sm">編輯</a>` : ""}
        </div>
      </article>`;
    // 驗證對戰：用 sessionStorage 傳內容
    document.getElementById("node-verify").onclick = () => {
      try { sessionStorage.setItem("verify_content", blocksText(blocks).slice(0, 5000)); } catch {}
      location.href = "quiz.html?topic=" + encodeURIComponent(n.title) + "&from=verify";
    };
    // 探索度 +8%：讀完一頁
    try {
      const key = `dawn_explore_${user.id}_${n.category || "未分類"}`;
      const cur = parseFloat(localStorage.getItem(key) || "0");
      const updated = Math.min(100, cur + 8);
      localStorage.setItem(key, String(updated));
      // 顯示探索度
      const expEl = document.createElement("div");
      expEl.style.cssText = "margin-top:16px;padding:12px;border-radius:10px;background:oklch(0.74 0.14 80/0.08);font-size:13px;";
      expEl.innerHTML = `📖 「${htmlEsc(n.category || "未分類")}」探索度 <strong style="color:var(--brass-300);">${updated.toFixed(0)}%</strong>（+8%）`;
      view.querySelector("article").appendChild(expEl);
    } catch {}
  } catch (e) {
    view.innerHTML = `<div class="state-empty"><p>${htmlEsc(e.message)}</p><a href="knowledge.html" class="btn btn-primary">返回知識庫</a></div>`;
  }
}
