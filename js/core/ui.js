/* v4 核心：共用 UI（頂欄、時段背景、toast） */
import { getUser, getProfile, signOut } from "./supabase.js";

const NAV_GROUPS = [
  { label: "學習", items: [
    ["learn.html", "學習總覽", "nav-learn.webp"],
    ["feynman.html", "費曼說服", "nav-feynman.webp"],
    ["quiz.html", "知識對戰", "nav-quiz.webp"],
    ["review.html", "複習", "nav-review.webp"],
    ["knowledge.html", "知識庫", "nav-knowledge.webp"],
    ["bookshelf.html", "書架", "nav-bookshelf.webp"],
  ]},
  { label: "探索", items: [
    ["island.html", "群島", "nav-island.webp"],
    ["universe.html", "宇宙", "nav-universe.webp"],
    ["market.html", "商店", "nav-market.webp"],
  ]},
  { label: "我的", items: [
    ["home.html", "我的家", "nav-home.webp"],
    ["pet.html", "靈獸", "nav-pet.webp"],
    ["settings.html", "設定", "nav-settings.webp"],
  ]},
};
/* 扁平版（相容舊程式碼） */
const NAV = NAV_GROUPS.flatMap(g => g.items.map(([h, l, i]) => [h, l, i]));

/* SVG 小圖示（語義符號用向量，不用 emoji） */
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

export function toast(msg, ms = 2500) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* 確保 profiles 有這筆資料（Google 登入不會自動建） */
export async function ensureProfile(supabase, user) {
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  if (!data) {
    await supabase.from("profiles").insert({
      id: user.id,
      name: user.user_metadata?.full_name || user.email?.split("@")[0] || "旅人",
      email: user.email,
      points: 0,
      onboarded: false,
    });
  }
}

/* 輕量 markdown 渲染（AI 回傳用）：先 esc 再轉標籤，防 XSS */
export function md(src) {
  let h = esc(src);
  /* 程式碼區塊 ```...``` */
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  /* 行內程式碼 `...` */
  h = h.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  /* 粗體 **...** */
  h = h.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  /* 斜體 *...* */
  h = h.replace(/(^|[\s>])\*([^*\n]+?)\*/g, "$1<em>$2</em>");
  /* 標題 ### / ## / # */
  h = h.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  h = h.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  h = h.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  /* 有序列表 */
  h = h.replace(/((?:^\d+\. .+$\n?)+)/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  /* 無序列表 */
  h = h.replace(/((?:^[-•] .+$\n?)+)/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^[-•] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  /* 段落：雙換行分段，單換行轉 <br> */
  h = h.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return "";
    if (/^<(h\d|ul|ol|pre)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  return h;
}

/* 渲染頂欄；current 為當前頁面檔名 */
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
  const nav = NAV.map(([href, label, icon]) =>
    `<a href="${href}" class="${href === current ? "active" : ""}">${icon ? navIcon(icon, "nav-ico sm") : ""}${label}</a>`).join("");
  const mnavHtml = NAV_GROUPS.map(g => `
    <div class="mnav-group">
      <div class="mnav-label">${g.label}</div>
      ${g.items.map(([href, label, icon]) =>
        `<a href="${href}" class="${href === current ? "active" : ""}">${navIcon(icon)}${label}</a>`).join("")}
    </div>`).join("");
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="topbar">
      <a class="brand" href="learn.html">曙光<span>教育</span></a>
      <nav class="nav">${nav}</nav>
      <button class="nav-toggle" id="nav-toggle" aria-label="選單">${ICO.menu}</button>
      <div class="user-chip">
        ${user ? `<span class="pts">${pts.toLocaleString()}</span> 星砂
          <a href="settings.html" style="color:var(--paper-400);text-decoration:none;">${esc(name) || "設定"}</a>
          <button class="btn btn-ghost" style="padding:4px 12px;font-size:12px;" id="tb-logout">登出</button>`
        : `<a class="btn btn-primary" style="padding:6px 16px;font-size:13px;" href="index.html">登入</a>`}
      </div>
    </header>
    <nav class="mobile-nav" id="mobile-nav">${mnavHtml}</nav>`);
  const lo = document.getElementById("tb-logout");
  if (lo) lo.onclick = signOut;
  /* 漢堡選單 */
  const toggle = document.getElementById("nav-toggle");
  const mnav = document.getElementById("mobile-nav");
  if (toggle && mnav) {
    toggle.onclick = () => mnav.classList.toggle("open");
    mnav.querySelectorAll("a").forEach(a => {
      a.onclick = () => mnav.classList.remove("open");
    });
  }
}

/* 需要登入的頁面呼叫；未登入導向首頁 */
export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = "index.html";
    throw new Error("not logged in");
  }
  return user;
}

/* 一次性引導 */
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
