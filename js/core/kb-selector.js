/* 曙光寶庫選擇器共用元件：讓各功能頁可以從曙光寶庫選主題，而非只能手動輸入 */
import { esc } from "./ui.js";

/**
 * 建立寶庫下拉選單
 * @param {string} selectId - select 元素的 id
 * @param {string} inputId - 要填入的 input 元素 id（選了之後自動填）
 * @param {object} supabase - supabase client
 * @param {string} userId - 用戶 id
 */
export async function initKbSelector(selectId, inputId, supabase, userId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const { data: own } = await supabase.from("knowledge_nodes")
      .select("title").eq("user_id", userId).eq("is_public", true).limit(50);
    let favTitles = [];
    try {
      const { data: favs } = await supabase.from("node_favorites").select("node_id").eq("user_id", userId);
      if (favs?.length) {
        const ids = favs.map(f => f.node_id);
        const { data: favNodes } = await supabase.from("knowledge_nodes").select("title").in("id", ids).eq("is_public", true);
        if (favNodes) favTitles = favNodes.map(n => n.title);
      }
    } catch {}
    const ownTitles = (own || []).map(n => n.title);
    const allTitles = [...new Set([...ownTitles, ...favTitles])];
    if (allTitles.length) {
      const ownOpts = ownTitles.map(t => `<option value="${esc(t)}">${esc(t)}（我的）</option>`).join("");
      const favOpts = favTitles.filter(t => !ownTitles.includes(t)).map(t => `<option value="${esc(t)}">${esc(t)}（收藏）</option>`).join("");
      sel.innerHTML = `<option value="">— 從曙光寶庫選 —</option><optgroup label="我的寶庫">${ownOpts}</optgroup>${favOpts ? `<optgroup label="收藏的">${favOpts}</optgroup>` : ""}`;
      sel.onchange = e => {
        if (e.target.value && inputId) {
          const inp = document.getElementById(inputId);
          if (inp) inp.value = e.target.value;
        }
      };
      sel.style.display = "";
    }
  } catch {}
}
