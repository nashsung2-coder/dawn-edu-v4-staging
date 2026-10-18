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
 * 取得近 N 天的學習歷史
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
 * @param {Array} items
 * @param {string|object} emptyTextOrOpts - 空文字，或 { emptyText, groupBy: 'date'|'topic' }
 */
export function renderHistoryList(items, emptyTextOrOpts) {
  let emptyText = "近 5 天還沒有學習紀錄，去學點東西吧！";
  let groupBy = "topic";
  if (typeof emptyTextOrOpts === "string") emptyText = emptyTextOrOpts;
  else if (emptyTextOrOpts) {
    if (emptyTextOrOpts.emptyText) emptyText = emptyTextOrOpts.emptyText;
    if (emptyTextOrOpts.groupBy) groupBy = emptyTextOrOpts.groupBy;
  }
  if (!items.length) return `<p style="color:var(--paper-400);font-size:13px;">${emptyText}</p>`;
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = iso => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
    } catch { return ""; }
  };
  const badge = t => `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(139,92,246,0.15);color:#c4b5fd;white-space:nowrap;">${escH(t)}</span>`;

  if (groupBy === "date") {
    // 按日期分組
    const groups = {};
    items.forEach(it => {
      const d = fmtDate(it.created_at);
      if (!groups[d]) groups[d] = [];
      groups[d].push(it);
    });
    return Object.entries(groups).map(([date, list]) => `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;color:var(--paper-400);margin-bottom:6px;">${escH(date)}</div>
        ${list.map(it => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px;">
            ${badge(it.type)}
            <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escH(it.topic || it.detail || "學習活動")}</span>
            ${it.link ? `<a href="${escH(it.link)}" style="font-size:11px;color:var(--brass-300);white-space:nowrap;">查看</a>` : ""}
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  // 按主題分組：同一個主題的各種學習整理在一起
  const groups = {};
  const order = [];
  items.forEach(it => {
    const key = (it.topic || "").trim() || `（${it.type}）`;
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(it);
  });
  return order.map(k => `
    <div style="margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;">${escH(k)}</div>
      ${groups[k].map(it => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px;">
          ${badge(it.type)}
          <span style="font-size:11px;color:var(--paper-400);white-space:nowrap;">${escH(fmtDate(it.created_at))}</span>
          <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escH(it.detail || "學習活動")}</span>
          ${it.link ? `<a href="${escH(it.link)}" style="font-size:11px;color:var(--brass-300);white-space:nowrap;">查看</a>` : ""}
        </div>
      `).join("")}
    </div>
  `).join("");
}

/**
 * 在指定容器渲染某類型的歷史（無限回顧）
 * @param {object} supabase
 * @param {string} userId
 * @param {string} containerId - 容器元素 id
 * @param {string} type - 歷史類型
 */
export async function renderTypeHistory(supabase, userId, containerId, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<p style="color:var(--paper-400);font-size:13px;">載入中…</p>`;
  try {
    const items = await getRecentHistory(supabase, userId, 0, type);
    el.innerHTML = renderHistoryList(items, "還沒有學習紀錄，完成一次就會出現在這裡");
  } catch {
    el.innerHTML = "";
  }
}

/* 各頁歷史容器的類型對照（給 refreshHistoryUI 用） */
const HISTORY_CONTAINER_TYPE = {
  "qz-history": "知識對戰",
  "fy-history": "思辨對話",
  "sc-history": "情境學習",
  "rd-history": "AI閱讀",
  "arcade-history": "街機",
  "cp-history": null, /* 主控台：近 5 天綜合 */
};

/**
 * 重新整理頁面上所有歷史區塊（寫入新紀錄後呼叫，不用重整頁面）
 */
export async function refreshHistoryUI(supabase, userId) {
  try {
    if (!supabase || !userId) return;
    const emptyTypeText = "還沒有學習紀錄，完成一次就會出現在這裡";
    for (const [id, type] of Object.entries(HISTORY_CONTAINER_TYPE)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const items = type
        ? await getRecentHistory(supabase, userId, 0, type)
        : await getRecentHistory(supabase, userId, 5);
      el.innerHTML = renderHistoryList(items, type ? emptyTypeText : undefined);
    }
    const pl = document.getElementById("page-history-list");
    if (pl) {
      const page = (location.pathname.split("/").pop() || "").replace(/\.html.*$/, "");
      const type = PAGE_HISTORY_TYPE[page];
      const items = type
        ? await getRecentHistory(supabase, userId, 0, type)
        : await getRecentHistory(supabase, userId, 5);
      pl.innerHTML = renderHistoryList(items, type ? emptyTypeText : undefined);
    }
  } catch (e) {
    console.warn("重整歷史顯示失敗:", e.message);
  }
}
/**
 * 頁面檔名 → 學習歷史類型的對照（有對應的頁面顯示該類型的無限歷史，
 * 沒有對應的頁面顯示近 5 天全部類型的綜合歷史）
 */
const PAGE_HISTORY_TYPE = {
  "quiz": "知識對戰",
  "feynman": "思辨對話",
  "scenario": "情境學習",
  "reading": "AI閱讀",
  "arcade": "街機",
  "review": "複習",
};

/* ===== 學習進度快照（learn_sessions）：點開歷史可恢復當時進度 ===== */

/**
 * 建立一次學習會話，之後用 saveLearnSession 持續存快照
 * @returns {string|null} session id（表不存在或失敗時回 null，呼叫端要能優雅降級）
 */
export async function createLearnSession(supabase, userId, type, topic) {
  try {
    if (!supabase || !userId) return null;
    const { data, error } = await supabase.from("learn_sessions")
      .insert({ user_id: userId, type, topic: topic || "" })
      .select("id").single();
    if (error) throw error;
    return data?.id || null;
  } catch {
    return null;
  }
}

/** 存快照（fire-and-forget 即可，內部已吞掉錯誤） */
export async function saveLearnSession(supabase, sessionId, state) {
  if (!supabase || !sessionId) return;
  try {
    await supabase.from("learn_sessions").update({
      state: state || {},
      updated_at: new Date().toISOString(),
    }).eq("id", sessionId);
  } catch {}
}

/** 讀取快照（會驗證 user_id，避免看到別人的） */
export async function loadLearnSession(supabase, sessionId, userId) {
  try {
    if (!supabase || !sessionId || !userId) return null;
    const { data, error } = await supabase.from("learn_sessions")
      .select("*").eq("id", sessionId).eq("user_id", userId).single();
    if (error) throw error;
    return data || null;
  } catch {
    return null;
  }
}

/** 歷史連結：有 session 就帶上，沒有就回功能首頁 */
export function sessionLink(page, sessionId) {
  return sessionId ? `${page}?session=${sessionId}` : page;
}
const PAGE_HISTORY_SKIP = ["index", "onboarding", "privacy", "terms", "socratic", "node-editor"];

/**
 * 在頁面底部自動掛載歷史紀錄區塊。
 * 已有獨立歷史容器（id 以 -history 結尾）的頁面會跳過，由各頁自行渲染。
 */
export async function mountPageHistory(supabase, user) {
  try {
    if (!supabase || !user) return;
    if (document.getElementById("page-history")) return;
    if (document.querySelector("[id$='-history']")) return;
    const page = (location.pathname.split("/").pop() || "").replace(/\.html.*$/, "");
    if (!page || PAGE_HISTORY_SKIP.includes(page)) return;
    const host = document.querySelector(".main") || document.querySelector("main") || document.body;
    if (!host) return;
    const type = PAGE_HISTORY_TYPE[page];
    const title = type ? `${type}歷史` : "學習歷程";
    const sub = type ? "可以無限回顧" : "近 5 天・所有學習";
    const sec = document.createElement("section");
    sec.id = "page-history";
    sec.style.cssText = "margin-top:36px;";
    sec.innerHTML = `<h2 style="font-size:16px;margin-bottom:4px;">${title}</h2>
      <p style="font-size:12px;color:var(--paper-400);margin-bottom:12px;">${sub}</p>
      <div id="page-history-list"><p style="color:var(--paper-400);font-size:13px;">載入中…</p></div>`;
    host.appendChild(sec);
    const items = type
      ? await getRecentHistory(supabase, user.id, 0, type)
      : await getRecentHistory(supabase, user.id, 5);
    const listEl = document.getElementById("page-history-list");
    if (listEl) listEl.innerHTML = renderHistoryList(items, type ? "還沒有學習紀錄，完成一次就會出現在這裡" : undefined);
  } catch (e) {
    console.warn("掛載頁面歷史失敗:", e.message);
  }
}
