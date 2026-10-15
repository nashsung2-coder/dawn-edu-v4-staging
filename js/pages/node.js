/* 知識節點獨立閱讀頁：像電子書/部落格一樣打開 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, ensureProfile } from "../core/ui.js?v=fixed002";
import { esc as _esc } from "../core/ui.js?v=fixed002";
const esc = typeof _esc === "function" ? _esc : (s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])));
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
          <span style="font-size:12px;padding:4px 12px;border-radius:20px;background:oklch(0.75 0.15 80 / 0.15);color:var(--brass-300);">${esc(n.category || "未分類")}</span>
          ${date ? `<span style="font-size:12px;color:var(--paper-400);">${date}</span>` : ""}
        </div>
        <h1 style="font-size:24px;margin-bottom:8px;line-height:1.4;">${esc(n.title)}</h1>
        ${question ? `<p style="font-size:15px;color:var(--brass-300);margin-bottom:20px;line-height:1.7;">${esc(question)}</p>` : ""}
        <div style="border-top:1px solid oklch(1 0 0 / 0.08);margin:16px 0;"></div>
        <div class="blocks-content">${blocks.length ? renderBlocks(blocks) : `<p style="color:var(--paper-400);">${esc(n.content || "")}</p>`}</div>
        <div style="border-top:1px solid oklch(1 0 0 / 0.08);margin:24px 0 16px;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a href="quiz.html?topic=${encodeURIComponent(n.title)}&content=${encodeURIComponent(blocksText(blocks).slice(0, 2000))}" class="btn btn-primary btn-sm">開始驗證對戰</a>
          ${String(n.user_id) === String(user.id) ? `<a href="node-editor.html?id=${n.id}" class="btn btn-ghost btn-sm">編輯</a>` : ""}
        </div>
      </article>`;
  } catch (e) {
    view.innerHTML = `<div class="state-empty"><p>${esc(e.message)}</p><a href="knowledge.html" class="btn btn-primary">返回知識庫</a></div>`;
  }
}
