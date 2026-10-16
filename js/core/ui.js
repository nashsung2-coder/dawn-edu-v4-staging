/* v4 \u6838\u5fc3\uff1a\u5171\u7528 UI\uff08\u9802\u6b04\u3001\u6642\u6bb5\u80cc\u666f\u3001toast\uff09 */
import { getUser, getProfile, signOut } from "./supabase.js";

const NAV_GROUPS = [
  { label: "\u4e3b\u63a7\u53f0", items: [
    ["dashboard.html", "\u4e3b\u63a7\u53f0", "nav-learn.webp"],
  ]},
  { label: "\u5b78\u7fd2", items: [
    ["learn.html", "\u5b78\u7fd2\u7e3d\u89bd", "nav-learn.webp"],
    ["knowledge.html", "\u77e5\u8b58\u5eab", "nav-knowledge.webp"],
    ["feynman.html", "\u8cbb\u66fc\u8aaa\u670d", "nav-feynman.webp"],
    ["socratic.html", "\u8607\u683c\u62c9\u5e95\u5c0d\u8a71", "nav-sparkle.webp"],
    ["quiz.html", "\u77e5\u8b58\u5c0d\u6230", "nav-quiz.webp"],
    ["review.html", "\u8907\u7fd2", "nav-review.webp"],
    ["bookshelf.html", "\u66f8\u67b6", "nav-bookshelf.webp"],
  ]},
  { label: "\u5b87\u5b99", items: [
    ["island.html", "\u7fa4\u5cf6", "nav-island.webp"],
    ["universe.html", "\u5b87\u5b99\u5f81\u670d", "nav-universe.webp"],
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
  /* \u6bb5\u843d\uff1a\u96d9\u63db\u884c\u5206\u6bb5\uff0c\u55ae\u63db\u884c\u8f49 <br> */
  h = h.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return "";
    if (/^<(h\d|ul|ol|pre)/.test(p)) return p;
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
      <a class="brand" href="learn.html">\u66d9\u5149<span>\u6559\u80b2</span></a>
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
