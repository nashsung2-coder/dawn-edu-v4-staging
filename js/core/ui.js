/* v4 \u6838\u5fc3\uff1a\u5171\u7528 UI\uff08\u9802\u6b04\u3001\u6642\u6bb5\u80cc\u666f\u3001toast\uff09 */
import { getUser, getProfile, signOut, supabase } from "./supabase.js";
import { buildLearningContext, companionChat } from "./companion.js";

const NAV_GROUPS = [
  { label: "\u4e3b\u63a7\u53f0", items: [
    ["dashboard.html", "\u4e3b\u63a7\u53f0", "nav-learn.webp"],
  ]},
  { label: "\u5b78\u7fd2", items: [
    ["knowledge.html", "\u66d9\u5149\u5bf6\u5eab", "nav-knowledge.webp"],
    ["scenario.html", "\u60c5\u5883\u5b78\u7fd2", "nav-island.webp"],
    ["reading.html", "\u8de8\u8a9e\u8a00\u95b1\u8b80", "nav-quiz.webp"],
    ["feynman.html", "\u601d\u8faf\u5c0d\u8a71", "nav-feynman.webp"],
    ["learn.html", "\u5b78\u7fd2\u7e3d\u89bd", "nav-learn.webp"],
    ["bookshelf.html", "\u66f8\u67b6", "nav-bookshelf.webp"],
  ]},
  { label: "\u6aa2\u9a57", items: [
    ["quiz.html", "\u77e5\u8b58\u5c0d\u6230", "nav-quiz.webp"],
    ["review.html", "\u8907\u7fd2", "nav-review.webp"],
  ]},
  { label: "\u6a02\u8da3", items: [
    ["arcade.html", "\u8857\u6a5f\u904a\u6232", "nav-universe.webp"],
    ["island.html", "\u7fa4\u5cf6", "nav-island.webp"],
    ["market.html", "\u5546\u5e97", "nav-market.webp"],
  ]},
  { label: "\u5bb6", items: [
    ["home.html", "\u6211\u7684\u5bb6", "nav-home.webp"],
    ["pet.html", "\u9748\u7378", "nav-pet.webp"],
    ["settings.html", "\u8a2d\u5b9a", "nav-settings.webp"],
  ]},
];
/* \u6241\u5e73\u7248\uff08\u76f8\u5bb9\u820a\u7a0b\u5f0f\u78bc\uff09 */
const NAV = NAV_GROUPS.flatMap(g => g.items.map(([h, l, i]) => [h, l, i]));

/* SVG \u5c0f\u5716\u793a\uff08\u8a9e\u7fa9\u7b26\u865f\u7528\u5411\u91cf\uff0c\u4e0d\u7528 emoji\uff09 */
export const ICO = {
  check: `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  cross: `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  menu: `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  star: f => `<svg class="ico-svg" viewBox="0 0 24 24" fill="${f ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.7 5.9 21l1.4-6.8L2.2 9.6l6.9-.8z"/></svg>`,
};
export const navIcon = (file, cls = "nav-ico") =>
  `<img class="${cls}" src="../assets/icons/${file}" alt="" loading="lazy">`;

export function timeSlot() {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

const BG_MAP = {
  dawn: "../assets/bg-dawn.webp",
  day: "../assets/bg-day.webp",
  dusk: "../assets/bg-dusk.webp",
  night: "../assets/bg-night.webp",
};

export function applyTimeBg() {
  let el = document.querySelector(".time-bg");
  if (!el) {
    el = document.createElement("div");
    el.className = "time-bg";
    document.body.prepend(el);
  }
  el.style.backgroundImage = `url("${BG_MAP[timeSlot()]}")`;
}

const _toastQueue = [];
let _toastShowing = false;
export function toast(msg, ms = 2500) {
  _toastQueue.push({ msg, ms });
  if (!_toastShowing) _showNextToast();
}
function _showNextToast() {
  const item = _toastQueue.shift();
  if (!item) { _toastShowing = false; return; }
  _toastShowing = true;
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = item.msg;
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(_showNextToast, 300); // 間隔再顯示下一則
  }, item.ms);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ===== 強健的 AI JSON 解析 =====
 * AI 回傳常夾雜 markdown code fence、多餘文字、trailing comma。
 * 此函數：去 code fence → 括號平衡擷取 → 嘗試修復 → JSON.parse。
 * 傳入期望的開括號 ('[' 或 '{')，回傳解析結果；失敗則 throw。 */
export function parseAIJson(reply, open = "[") {
  const close = open === "[" ? "]" : "}";
  let text = String(reply ?? "");
  // 1. 去掉 markdown code fence
  text = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "");
  // 2. 括號平衡擷取（處理字串內的括號與跳脫）
  const start = text.indexOf(open);
  if (start === -1) throw new Error("AI 回傳中找不到 JSON");
  let depth = 0, inStr = false, escNext = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escNext) { escNext = false; continue; }
    if (ch === "\\" && inStr) { escNext = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("AI 回傳的 JSON 括號不完整");
  const raw = text.slice(start, end + 1);
  // 3. 直接解析
  try { return JSON.parse(raw); } catch (e1) {
    // 4. 修復常見瑕疵：trailing comma
    const fixed = raw.replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(fixed); } catch (e2) {
      throw new Error("AI 回傳的 JSON 格式錯誤");
    }
  }
}

/* \u78ba\u4fdd profiles \u6709\u9019\u7b46\u8cc7\u6599\uff08Google \u767b\u5165\u4e0d\u6703\u81ea\u52d5\u5efa\uff09 */
export async function ensureProfile(supabase, user) {
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  if (!data) {
    await supabase.from("profiles").insert({
      id: user.id,
      name: user.user_metadata?.full_name || user.email?.split("@")[0] || "\u65c5\u4eba",
      email: user.email,
      points: 0,
      onboarded: false,
    });
  }
}

/* \u8f15\u91cf markdown \u6e32\u67d3\uff08AI \u56de\u50b3\u7528\uff09\uff1a\u5148 esc \u518d\u8f49\u6a19\u7c64\uff0c\u9632 XSS */
export function md(src) {
  let h = esc(src);
  /* \u7a0b\u5f0f\u78bc\u5340\u584a ```...``` */
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  /* \u884c\u5167\u7a0b\u5f0f\u78bc `...` */
  h = h.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  /* \u7c97\u9ad4 **...** */
  h = h.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  /* \u659c\u9ad4 *...* */
  h = h.replace(/(^|[\s>])\*([^*\n]+?)\*/g, "$1<em>$2</em>");
  /* \u6a19\u984c ### / ## / # */
  h = h.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  h = h.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  h = h.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  /* \u6709\u5e8f\u5217\u8868 */
  h = h.replace(/((?:^\d+\. .+$\n?)+)/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  /* \u7121\u5e8f\u5217\u8868 */
  h = h.replace(/((?:^[-\u2022] .+$\n?)+)/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^[-\u2022] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  /* 表格 | 表頭 | 分隔 | 內容（前後強制斷段，確保獨立成塊） */
  h = h.replace(/^(\|.+\|)\r?\n\|[\s:|-]+\|\r?\n((?:\|.+\|\r?\n?)+)/gm, (m, header, body) => {
    const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
    const th = cells(header).map(c => `<th>${c}</th>`).join('');
    const rows = body.trim().split('\n').map(r =>
      `<tr>${cells(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `\n\n<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>\n\n`;
  });
  /* \u6bb5\u843d\uff1a\u96d9\u63db\u884c\u5206\u6bb5\uff0c\u55ae\u63db\u884c\u8f49 <br> */
  h = h.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return "";
    if (/^<(h\d|ul|ol|pre|div)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  return h;
}

/* \u6e32\u67d3\u9802\u6b04\uff1bcurrent \u70ba\u7576\u524d\u9801\u9762\u6a94\u540d */
export async function renderTopbar(current) {
  applyTimeBg();
  const user = await getUser();
  let pts = 0, name = "";
  if (user) {
    try {
      const p = await getProfile(user.id);
      pts = p.points ?? 0;
      name = p.name || "";
    } catch (e) {}
  }
  const nav = NAV_GROUPS.map(g => {
    const hasActive = g.items.some(([href]) => href === current);
    if (g.items.length === 1) {
      const [href, label, icon] = g.items[0];
      return `<a href="${href}" class="nav-link ${href === current ? "active" : ""}">${icon ? navIcon(icon, "nav-ico sm") : ""}${label}</a>`;
    }
    return `<div class="nav-drop ${hasActive ? "active-group" : ""}">
      <button class="nav-link nav-drop-btn">${g.label}<span class="drop-arrow">▾</span></button>
      <div class="nav-drop-menu">
        ${g.items.map(([href, label, icon]) =>
          `<a href="${href}" class="${href === current ? "active" : ""}">${icon ? navIcon(icon, "nav-ico sm") : ""}${label}</a>`).join("")}
      </div>
    </div>`;
  }).join("");
  const mnavHtml = NAV_GROUPS.map(g => {
    const hasActive = g.items.some(([href]) => href === current);
    return `
    <div class="mnav-group ${hasActive ? "" : "collapsed"}">
      <button class="mnav-label">${g.label}<span class="drop-arrow">▾</span></button>
      <div class="mnav-items">
      ${g.items.map(([href, label, icon]) =>
        `<a href="${href}" class="${href === current ? "active" : ""}">${navIcon(icon)}${label}</a>`).join("")}
      </div>
    </div>`;
  }).join("");
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="topbar">
      <a class="brand" href="dashboard.html">曙光<span>學習</span></a>
      <nav class="nav">${nav}</nav>
      <button class="nav-toggle" id="nav-toggle" aria-label="\u9078\u55ae">${ICO.menu}</button>
      <div class="user-chip">
        ${user ? `<span class="pts">${pts.toLocaleString()}</span> \u661f\u7802
          <a href="settings.html" style="color:var(--paper-400);text-decoration:none;">${esc(name) || "\u8a2d\u5b9a"}</a>
          <button class="btn btn-ghost" style="padding:4px 12px;font-size:12px;" id="tb-logout">\u767b\u51fa</button>`
        : `<a class="btn btn-primary" style="padding:6px 16px;font-size:13px;" href="index.html">\u767b\u5165</a>`}
      </div>
    </header>
    <nav class="mobile-nav" id="mobile-nav">${mnavHtml}</nav>`);
  /* Speculation Rules：hover 導覽連結即預渲染，頁面切換近乎即時 */
  try {
    if (!document.querySelector('script[type="speculationrules"]') && "HTMLScriptElement" in window) {
      const urls = [...new Set(NAV.map(([h]) => h))].filter(h => h && !h.startsWith("http"));
      const s = document.createElement("script");
      s.type = "speculationrules";
      s.textContent = JSON.stringify({
        prerender: [{ source: "list", urls, eagerness: "moderate" }],
      });
      document.head.appendChild(s);
    }
  } catch {}
  /* 環境氛圍：滑鼠跟隨柔光＋視差 */
  try {
    const { initAmbient } = await import("./ambient.js");
    initAmbient();
  } catch {}
  /* AI 免責聲明：互動功能頁在 page-head 下自動掛載 */
  try {
    const aiPages = ["quiz.html", "scenario.html", "feynman.html", "arcade.html", "reading.html"];
    const cur = (location.pathname.split("/").pop() || "").split("?")[0];
    if (aiPages.includes(cur) && !document.querySelector(".ai-disclaimer")) {
      const anchor = document.querySelector("main .page-head") || document.querySelector("main h1");
      if (anchor) anchor.insertAdjacentHTML("afterend",
        `<p class="ai-disclaimer">由 AI 生成，不保證知識準確性，僅供學習參考。</p>`);
    }
  } catch {}
  const lo = document.getElementById("tb-logout");
  if (lo) lo.onclick = signOut;
  /* \u4e0b\u62c9\u9078\u55ae\u4e92\u52d5 */
  document.querySelectorAll(".nav-drop-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const drop = btn.closest(".nav-drop");
      const wasOpen = drop.classList.contains("open");
      document.querySelectorAll(".nav-drop.open").forEach(d => d.classList.remove("open"));
      if (!wasOpen) drop.classList.add("open");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".nav-drop.open").forEach(d => d.classList.remove("open"));
  });
  /* \u6f22\u5821\u9078\u55ae */
  const toggle = document.getElementById("nav-toggle");
  const mnav = document.getElementById("mobile-nav");
  if (toggle && mnav) {
    toggle.onclick = () => mnav.classList.toggle("open");
    mnav.querySelectorAll("a").forEach(a => {
      a.onclick = () => mnav.classList.remove("open");
    });
    mnav.querySelectorAll(".mnav-label").forEach(lbl => {
      lbl.onclick = e => {
        e.stopPropagation();
        const grp = lbl.closest(".mnav-group");
        grp.classList.toggle("collapsed");
        const items = grp.querySelector(".mnav-items");
        if (!grp.classList.contains("collapsed")) {
          items.style.maxHeight = items.scrollHeight + "px";
        }
      };
    });
    /* 展開當前群組 */
    mnav.querySelectorAll(".mnav-group:not(.collapsed) .mnav-items").forEach(items => {
      items.style.maxHeight = items.scrollHeight + "px";
    });
  }
  // 非主控台頁面顯示懸浮聊天球
  try { initFloatingChat(current); } catch (e) { console.error("懸浮球初始化失敗:", e); }
  /* 每一頁底部自動掛載歷史紀錄（已有獨立歷史區塊的頁面會跳過） */
  try {
    const { mountPageHistory } = await import("./learn-history.js?v=sess002");
    mountPageHistory(supabase, user);
  } catch (e) { console.warn("歷史區塊掛載失敗:", e.message); }
}

/* \u9700\u8981\u767b\u5165\u7684\u9801\u9762\u547c\u53eb\uff1b\u672a\u767b\u5165\u5c0e\u5411\u9996\u9801 */
export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = "index.html";
    throw new Error("not logged in");
  }
  return user;
}

/* \u4e00\u6b21\u6027\u5f15\u5c0e */
export function once(key, renderFn) {
  if (localStorage.getItem(key)) return;
  const el = document.createElement("div");
  el.className = "onboarding";
  el.innerHTML = `<div class="box">${renderFn()}</div>`;
  const close = () => {
    localStorage.setItem(key, "1");
    el.remove();
  };
  el.querySelector("[data-close]")?.addEventListener("click", close);
  el.addEventListener("click", e => { if (e.target === el) close(); });
  document.body.appendChild(el);
}

/* ===== 懸浮小曙聊天球（非主控台頁面） ===== */
let fcContext = "", fcNickname = "同學", fcMemory = "", fcHistory = [], fcUid = null;
const FC_PET_IMG = {
  "貓": "pet-cat.webp", "狐": "pet-fox.webp", "龍": "pet-dragon.webp", "鳥": "pet-bird.webp",
  "鹿": "pet-deer.webp", "龜": "pet-turtle.webp", "兔": "pet-rabbit.webp",
};
function fcPetImg(species) {
  return `../assets/icons/${FC_PET_IMG[species] || "xiaoshu-avatar.webp"}`;
}

async function initFloatingChat(current) {
  if (current === "dashboard.html") return; // 主控台已有完整對話區
  if (document.getElementById("fc-ball")) return; // 避免重複

  // 樣式
  const style = document.createElement("style");
  style.textContent = `
    #fc-ball { position:fixed; right:18px; bottom:18px; width:56px; height:56px; border-radius:50%;
      overflow:hidden; cursor:pointer; z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,.4);
      border:2px solid var(--brass-400); transition:transform .2s; }
    #fc-ball:hover { transform:scale(1.08); }
    #fc-ball img { width:100%; height:100%; object-fit:cover; }
    #fc-panel { position:fixed; right:18px; bottom:86px; width:320px; max-width:calc(100vw - 36px);
      height:440px; max-height:calc(100vh - 120px); z-index:9999; display:none; flex-direction:column;
      background:var(--bg-1); border:1px solid var(--brass-500); border-radius:12px; overflow:hidden;
      box-shadow:0 8px 32px rgba(0,0,0,.5); }
    #fc-panel.open { display:flex; }
    #fc-header { padding:10px 14px; background:var(--bg-3); display:flex; align-items:center; gap:8px;
      border-bottom:1px solid var(--line); }
    #fc-header img { width:28px; height:28px; border-radius:50%; object-fit:cover; }
    #fc-msgs { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
    #fc-input-row { padding:10px; border-top:1px solid var(--line); display:flex; gap:8px; }
    #fc-input { flex:1; }
    .fc-msg { max-width:85%; padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.5; }
    .fc-msg.user { align-self:flex-end; background:var(--brass-500); color:#000; }
    .fc-msg.ai { align-self:flex-start; background:var(--bg-3); color:var(--paper-50); }
    /* 手機優化：面板改為近全寬底部浮層、輸入框 16px 防 iOS 自動縮放 */
    @media (max-width:480px) {
      #fc-ball { right:14px; bottom:14px; width:52px; height:52px; }
      #fc-panel { left:12px; right:12px; width:auto; bottom:78px;
        height:min(62vh,520px); height:min(62dvh,520px);
        max-height:calc(100vh - 150px); max-height:calc(100dvh - 150px);
        border-radius:16px; }
      .fc-msg { font-size:14px; }
      #fc-input { font-size:16px; }
    }
  `;
  document.head.appendChild(style);

  // 球 + 面板 HTML
  document.body.insertAdjacentHTML("beforeend", `
    <div id="fc-ball" title="找小曙聊聊"><img id="fc-ball-img" src="../assets/icons/xiaoshu-avatar.webp" alt="小曙"></div>
    <div id="fc-panel">
      <div id="fc-header">
        <img id="fc-header-img" src="../assets/icons/xiaoshu-avatar.webp" alt="小曙">
        <b style="flex:1;">小曙</b>
        <button class="btn btn-ghost btn-sm" id="fc-close" style="padding:2px 8px;">✕</button>
      </div>
      <div id="fc-msgs"></div>
      <div style="padding:4px 12px 0;font-size:10px;color:var(--paper-400);opacity:.75;">由 AI 生成，不保證知識準確性，僅供學習參考。</div>
      <div id="fc-input-row">
        <input class="input" id="fc-input" placeholder="問小曙…" style="font-size:13px;">
        <button class="btn btn-primary btn-sm" id="fc-send">送出</button>
      </div>
    </div>`);

  const ball = document.getElementById("fc-ball");
  const panel = document.getElementById("fc-panel");
  // 長按拖動 vs 輕點開啟：用時間和移動距離區分
  let pressTimer = null, startX = 0, startY = 0, moved = false, isDragging = false;
  ball.addEventListener("pointerdown", e => {
    startX = e.clientX; startY = e.clientY; moved = false; isDragging = false;
    pressTimer = setTimeout(() => {
      isDragging = true;
      ball.setPointerCapture(e.pointerId);
    }, 300); // 長按 300ms 進入拖動模式
  });
  ball.addEventListener("pointermove", e => {
    if (!isDragging) {
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
        moved = true;
        clearTimeout(pressTimer);
      }
      return;
    }
    // 拖動中：移動球的位置
    const newRight = window.innerWidth - e.clientX - 28;
    const newBottom = window.innerHeight - e.clientY - 28;
    ball.style.right = Math.max(8, Math.min(window.innerWidth - 64, newRight)) + "px";
    ball.style.bottom = Math.max(8, Math.min(window.innerHeight - 64, newBottom)) + "px";
    // 面板跟著球走（保持相對位置）
    panel.style.right = ball.style.right;
    panel.style.bottom = (parseInt(ball.style.bottom) + 68) + "px";
  });
  ball.addEventListener("pointerup", e => {
    clearTimeout(pressTimer);
    if (isDragging) {
      isDragging = false;
    } else if (!moved) {
      // 輕點：開關對話框
      panel.classList.toggle("open");
      if (panel.classList.contains("open") && !fcUid) initFcChat();
    }
    moved = false;
  });
  ball.addEventListener("pointercancel", () => { clearTimeout(pressTimer); isDragging = false; });

  document.getElementById("fc-close").onclick = () => panel.classList.remove("open");
  document.getElementById("fc-send").onclick = () => fcSend(document.getElementById("fc-input").value);
  document.getElementById("fc-input").addEventListener("keydown", e => {
    if (e.key === "Enter") fcSend(document.getElementById("fc-input").value);
  });

  // 小曙協助跳轉後，預設自動開啟懸浮對話窗（flag 用完即刪，只觸發一次）
  try {
    if (sessionStorage.getItem("fc_auto_open") === "1") {
      sessionStorage.removeItem("fc_auto_open");
      panel.classList.add("open");
      if (!fcUid) initFcChat();
    }
  } catch {}
}

async function initFcChat() {
  try {
    const { getUser: _gu } = await import("./supabase.js");
    const user = await _gu();
    if (!user) return;
    fcUid = user.id;
    const { supabase } = await import("./supabase.js");
    // 載入靈寵：球換成靈寵圖片
    try {
      const { data: pet } = await supabase.from("pets").select("species").eq("user_id", user.id).limit(1).maybeSingle();
      if (pet?.species) {
        const imgSrc = fcPetImg(pet.species);
        document.getElementById("fc-ball-img").src = imgSrc;
        document.getElementById("fc-header-img").src = imgSrc;
      }
    } catch {}
    // 載入歷史並顯示
    try {
      const saved = localStorage.getItem(`xiaoshu_chat_${user.id}`);
      if (saved) {
        fcHistory = JSON.parse(saved).slice(-20);
        // 顯示歷史訊息（去掉工具標記）
        fcHistory.forEach(m => {
          if (m.role === "user" || m.role === "assistant") {
            const display = m.content.replace(/\[TOOL:[^\]]+\]/g, "").trim() || m.content;
            if (display) fcAddMsg(m.role === "user" ? "user" : "ai", display);
          }
        });
      }
    } catch {}
    // 暱稱 + context
    try {
      const { data: prof } = await supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
      if (prof?.nickname) fcNickname = prof.nickname;
      fcContext = await buildLearningContext(supabase, user.id);
      fcMemory = localStorage.getItem(`xiaoshu_memory_${user.id}`) || "";
    } catch {}
    if (!fcHistory.length) {
      fcAddMsg("ai", `嗨 ${fcNickname}！我是小曙，有什麼可以幫你的嗎？`);
    }
  } catch (e) { console.error("懸浮聊天初始化失敗:", e); }
}

function fcAddMsg(role, text) {
  const box = document.getElementById("fc-msgs");
  const div = document.createElement("div");
  div.className = `fc-msg ${role}`;
  /* AI 訊息：[HTML]...[/HTML] 走沙盒 iframe 只渲染結果；其餘走 md()（支援表格） */
  let htmlMatch = role === "ai" ? text.match(/\[HTML\]([\s\S]*?)\[\/HTML\]/) : null;
  if (!htmlMatch && role === "ai" && text.includes("[HTML]")) {
    const idx = text.indexOf("[HTML]") + 6;
    htmlMatch = [text.slice(idx - 6), text.slice(idx).trim()];
  }
  if (htmlMatch) {
    const htmlContent = htmlMatch[1].trim();
    const htmlStart = text.indexOf("[HTML]");
    const textBefore = (htmlStart > 0 ? text.slice(0, htmlStart) : "").trim();
    let inner = "";
    if (textBefore) inner += `<div style="margin-bottom:8px;">${md(textBefore)}</div>`;
    inner += `<iframe sandbox="allow-same-origin" style="width:100%;min-height:300px;border:1px solid oklch(1 0 0 / 0.1);border-radius:12px;background:#1a1a2e;" srcdoc="${esc(htmlContent)}"></iframe>`;
    div.innerHTML = inner;
  } else {
    div.innerHTML = role === "ai" ? md(text) : esc(text).replace(/\n/g, "<br>");
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function fcSend(text) {
  if (!text.trim()) return;
  document.getElementById("fc-input").value = "";
  fcAddMsg("user", text);
  fcHistory.push({ role: "user", content: text });
  fcAddMsg("ai", "…");
  const typingEl = document.getElementById("fc-msgs").lastChild;
  try {
    const reply = await companionChat(fcHistory, fcContext, null, fcNickname, fcMemory);
    typingEl.remove();
    // 移除工具標記後顯示
    const display = reply.replace(/\[TOOL:[^\]]+\]/g, "").trim() || reply;
    fcAddMsg("ai", display);
    fcHistory.push({ role: "assistant", content: reply });
    // 存檔
    try {
      const key = `xiaoshu_chat_${fcUid || "anon"}`;
      localStorage.setItem(key, JSON.stringify(fcHistory.slice(-50)));
    } catch {}
  } catch (e) {
    typingEl.remove();
    fcAddMsg("ai", "抱歉，我恍神了，再說一次好嗎？");
  }
}
