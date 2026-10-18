/* 學習歷史紀錄共用：所有學習功能完成後記錄，首頁/主控台顯示近 5 天 */

/**
 * 記錄一次學習活動
 * @param {object} supabase
 * @param {string} userId
 * @param {object} opts { type: '思辨對話'|'知識對戰'|'情境學習'|'AI閱讀'|'複習'|'街機'|'小曙對話'|'AI圖解', topic, detail, link }
 */
export async function logLearnHistory(supabase, userId, opts) {
  const { type, topic, detail, link } = opts;
  try {
    await supabase.from("learn_history").insert({
      user_id: userId,
      type,
      topic: topic || "",
      detail: detail || "",
      link: link || "",
    });
  } catch (e) {
    console.warn("記錄學習歷史失敗:", e.message);
  }
}

/**
 * 取得近 N 天的學習歷史（days=0 表示無限）
 */
export async function getRecentHistory(supabase, userId, days = 5, type = null) {
  try {
    let q = supabase.from("learn_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      q = q.gte("created_at", since.toISOString()).limit(50);
    } else {
      q = q.limit(200);
    }
    if (type) q = q.eq("type", type);
    const { data } = await q;
    return data || [];
  } catch {
    return [];
  }
}

/**
 * 渲染歷史列表 HTML（共用樣式）
 */
export function renderHistoryList(items) {
  if (!items.length) return `<p style="color:var(--paper-400);font-size:13px;">近 5 天還沒有學習紀錄，去學點東西吧！</p>`;
  const groups = {};
  items.forEach(it => {
    const d = new Date(it.created_at).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
    if (!groups[d]) groups[d] = [];
    groups[d].push(it);
  });
  return Object.entries(groups).map(([date, list]) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;color:var(--paper-400);margin-bottom:6px;">${date}</div>
      ${list.map(it => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px;">
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(139,92,246,0.15);color:#c4b5fd;white-space:nowrap;">${it.type}</span>
          <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.topic || it.detail || "學習活動"}</span>
          ${it.link ? `<a href="${it.link}" style="font-size:11px;color:var(--brass-300);">查看</a>` : ""}
        </div>
      `).join("")}
    </div>
  `).join("");
}

/**
 * 在指定容器渲染某類型的歷史（無限回顧）
 */
export async function renderTypeHistory(supabase, userId, containerId, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<p style="color:var(--paper-400);font-size:13px;">載入中…</p>`;
  try {
    const items = await getRecentHistory(supabase, userId, 0, type);
    el.innerHTML = renderHistoryList(items);
  } catch {
    el.innerHTML = "";
  }
}
