/* 曙光學習 — 時間主題系統
 * 深淺色模式（自動 / 深色 / 淺色）＋時段背景＋時段問候語。
 * 預設「自動」：背景、深淺、環境光跟著使用者本地時間走，
 * 每次進站都像回到屬於那個時段的圖書館。
 */

export const SLOTS = [
  { id: "dawn", label: "拂曉", hours: [5, 7], theme: "light", bg: "dawn",
    hues: ["0.80 0.10 60", "0.72 0.09 20", "0.78 0.08 85"],
    greet: ["早安", "早安，新的一天開始了", "早安，趁清晨讀一點吧"] },
  { id: "morning", label: "上午", hours: [7, 12], theme: "light", bg: "day",
    hues: ["0.85 0.06 85", "0.75 0.05 220", "0.80 0.07 100"],
    greet: ["上午好", "上午好，專注的時光", "上午好，來讀點東西吧"] },
  { id: "noon", label: "正午", hours: [12, 14], theme: "light", bg: "day",
    hues: ["0.88 0.05 90", "0.78 0.05 200", "0.82 0.06 80"],
    greet: ["午安", "午安，吃飽了嗎", "午安，休息一下再出發"] },
  { id: "afternoon", label: "午後", hours: [14, 17], theme: "light", bg: "day",
    hues: ["0.82 0.07 80", "0.76 0.06 180", "0.80 0.08 95"],
    greet: ["下午好", "下午好，繼續加油", "下午好，來場思辨對話吧"] },
  { id: "dusk", label: "黃昏", hours: [17, 20], theme: "light", bg: "dusk",
    hues: ["0.62 0.10 300", "0.70 0.12 50", "0.66 0.09 340"],
    greet: ["傍晚好", "傍晚好，今天過得如何", "傍晚好，複習一下今天學的吧"] },
  { id: "night", label: "深夜", hours: [20, 5], theme: "dark", bg: "night",
    hues: ["0.74 0.14 80", "0.66 0.07 200", "0.74 0.14 80"],
    greet: ["夜深了", "晚安", "夜深了，來場睡前複習吧"] },
];

const LS_MODE = "dawn-theme-mode";
const BG_MAP = {
  dawn: "../assets/bg-dawn.webp",
  day: "../assets/bg-day.webp",
  dusk: "../assets/bg-dusk.webp",
  night: "../assets/bg-night.webp",
};

function tesc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function slotOf(d = new Date()) {
  const h = d.getHours();
  return SLOTS.find(s => {
    const [a, b] = s.hours;
    return a < b ? (h >= a && h < b) : (h >= a || h < b);
  }) || SLOTS[5];
}

export function getMode() {
  try { return localStorage.getItem(LS_MODE) || "auto"; }
  catch { return "auto"; }
}
export function setMode(m) {
  try { localStorage.setItem(LS_MODE, m); } catch {}
}

export function resolveTheme(slot = slotOf()) {
  const m = getMode();
  return m === "auto" ? slot.theme : m;
}

/* 問候語：同一天固定一句，換天才換 */
export function pickGreeting(slot = slotOf(), d = new Date()) {
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return slot.greet[seed % slot.greet.length];
}
export function dateLine(d = new Date()) {
  const wk = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${wk}`;
}

let lastKey = "";
export function applyTheme(first = false) {
  const slot = slotOf();
  const theme = resolveTheme(slot);
  const key = `${theme}:${slot.id}`;
  const root = document.documentElement;
  const swap = () => {
    root.dataset.theme = theme;
    root.dataset.slot = slot.id;
    let el = document.querySelector(".time-bg");
    if (!el) {
      el = document.createElement("div");
      el.className = "time-bg";
      document.body.prepend(el);
    }
    el.style.backgroundImage = `url("${BG_MAP[slot.bg]}")`;
    dispatchEvent(new CustomEvent("dawn:slot", { detail: slot }));
  };
  const changed = !first && lastKey && lastKey !== key;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (changed && !reduceMotion) {
    /* 換主題時蓋一層紗再換，避免整頁閃爍 */
    const veil = document.createElement("div");
    veil.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none;background:var(--ink-950);opacity:0;transition:opacity .18s ease;";
    document.body.appendChild(veil);
    requestAnimationFrame(() => {
      veil.style.opacity = "1";
      setTimeout(() => {
        swap();
        veil.style.opacity = "0";
        setTimeout(() => veil.remove(), 450);
      }, 190);
    });
  } else {
    swap();
  }
  lastKey = key;
  return { slot, theme };
}

/* 每分鐘檢查時段是否變了（跨時段自動換背景/深淺） */
export function startThemeWatcher(onChange) {
  setInterval(() => {
    const before = lastKey;
    const r = applyTheme();
    if (lastKey !== before) onChange?.(r.slot, r.theme);
  }, 60000);
}

/* ===== 頂欄深淺色切換（三段：跟隨時間 / 淺色 / 深色） ===== */
const ICO_AUTO = `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const ICO_SUN = `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const ICO_MOON = `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

export function themeToggleHTML() {
  const m = getMode();
  const items = [
    ["auto", "跟隨時間", ICO_AUTO],
    ["light", "淺色", ICO_SUN],
    ["dark", "深色", ICO_MOON],
  ];
  return `<div class="theme-toggle" id="theme-toggle" role="group" aria-label="深淺色模式">` +
    items.map(([v, t, ic]) =>
      `<button type="button" data-mode="${v}" title="${t}" aria-label="${t}" class="${m === v ? "active" : ""}">${ic}</button>`
    ).join("") + `</div>`;
}

export function bindThemeToggle() {
  const box = document.getElementById("theme-toggle");
  if (!box || box.dataset.bound) return;
  box.dataset.bound = "1";
  box.addEventListener("click", e => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    setMode(b.dataset.mode);
    box.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    applyTheme();
  });
}

/* ===== 分頁上方問候列 ===== */
export function greetBarHTML(name) {
  const slot = slotOf();
  return `<div class="greet-bar" id="greet-bar">
    <span class="greet-main">${tesc(pickGreeting(slot))}${name ? `，${tesc(name)}` : ""}</span>
    <span class="greet-sub">${dateLine()} · ${slot.label}時分</span>
  </div>`;
}

export function refreshGreetBar(name) {
  const el = document.getElementById("greet-bar");
  if (!el) return;
  const slot = slotOf();
  const main = el.querySelector(".greet-main");
  const sub = el.querySelector(".greet-sub");
  if (main) main.textContent = `${pickGreeting(slot)}${name ? `，${name}` : ""}`;
  if (sub) sub.textContent = `${dateLine()} · ${slot.label}時分`;
}
