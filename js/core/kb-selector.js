/* 曙光寶庫多選器共用元件：各功能頁可從寶庫多選節點（可多選），不再只能單選填入 */
import { esc } from "./ui.js";

/**
 * 在 container 內渲染多選面板（checkbox 清單：「我的寶庫」＋「收藏的」分組）
 * @param {string} containerId - div 容器的 id
 * @param {object} supabase - supabase client
 * @param {string} userId - 用戶 id
 * @param {function} onChange - 選擇變動時回呼，參數為 [{id, title}]
 * @returns {Promise<{getSelected: () => Array<{id,title}>} | null>}
 */
export async function initKbSelector(containerId, supabase, userId, onChange) {
  const box = document.getElementById(containerId);
  if (!box) return null;

  let own = [];
  try {
    const { data } = await supabase.from("knowledge_nodes")
      .select("id,title").eq("user_id", userId).eq("is_public", true)
      .order("created_at", { ascending: false }).limit(60);
    own = data || [];
  } catch {}

  // 收藏：排除已在「我的寶庫」的（避免重複顯示），只留別人的公開節點
  let favs = [];
  try {
    const { data: fr } = await supabase.from("node_favorites").select("node_id").eq("user_id", userId);
    const ownIds = new Set(own.map(o => String(o.id)));
    const ids = (fr || []).map(f => f.node_id).filter(id => !ownIds.has(String(id)));
    if (ids.length) {
      const { data: fn } = await supabase.from("knowledge_nodes")
        .select("id,title").in("id", ids).eq("is_public", true);
      favs = fn || [];
    }
  } catch {}

  if (!own.length && !favs.length) return null;

  const selected = new Set();
  const all = [...own, ...favs];

  const groupHtml = (label, list) => list.length ? `
    <div style="margin:8px 0 4px;font-size:12px;color:var(--paper-400);">${esc(label)}</div>
    ${list.map(n => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px;" onmouseover="this.style.background='oklch(1 0 0 / 0.04)'" onmouseout="this.style.background=''">
        <input type="checkbox" data-kb-id="${esc(String(n.id))}" style="accent-color:var(--brass-400);flex:none;">
        <span>${esc(n.title)}</span>
      </label>`).join("")}` : "";

  box.innerHTML = `
    <div style="border:1px solid oklch(1 0 0 / 0.1);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:oklch(1 0 0 / 0.02);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:600;">從曙光寶庫選擇 <span style="font-weight:400;color:var(--paper-400);font-size:11px;">（可多選）</span></span>
        <span data-kb-count style="font-size:11px;color:var(--brass-300);">已選 0 個</span>
      </div>
      <div style="max-height:220px;overflow-y:auto;">
        ${groupHtml("我的寶庫", own)}
        ${groupHtml("收藏的", favs)}
      </div>
    </div>`;

  const getSelected = () =>
    [...selected]
      .map(id => all.find(n => String(n.id) === String(id)))
      .filter(Boolean)
      .map(n => ({ id: n.id, title: n.title }));

  const update = () => {
    const c = box.querySelector("[data-kb-count]");
    if (c) c.textContent = `已選 ${selected.size} 個`;
    if (onChange) { try { onChange(getSelected()); } catch {} }
  };

  box.querySelectorAll("input[type=checkbox][data-kb-id]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.kbId);
      else selected.delete(cb.dataset.kbId);
      update();
    });
  });

  return { getSelected };
}
