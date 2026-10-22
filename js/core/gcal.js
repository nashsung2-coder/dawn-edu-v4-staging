/* 曙光學習 — Google 日曆整合（GIS 前端授權版）
 * 用 Google Identity Services 在瀏覽器直接取得 access token，
 * 不需 client secret、不需後端刷新。使用者在本機瀏覽器完成授權即可。
 */
const CLIENT_ID = "583042386888-ktguvbjpb4ior7j8qs4t4d8fpck77vgc.apps.googleusercontent.com";
export const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const LS_TOKEN = "gcal_token_cache";
const LS_GRANTED = "gcal_granted";

let tokenClient = null;
let gisReady = null;

/* ---------- 載入 GIS 並建立 token client ---------- */
function loadGIS() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const init = () => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: CAL_SCOPE,
          callback: () => {}, /* 每次請求時覆寫 */
        });
        resolve();
      } catch (e) { reject(e); }
    };
    if (window.google?.accounts?.oauth2) return init();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    s.onerror = () => reject(new Error("GIS 載入失敗"));
    document.head.appendChild(s);
  });
  return gisReady;
}

/* ---------- 要求一顆 token（prompt: "" 靜默 / "consent" 顯示授權） ---------- */
function requestToken(prompt) {
  return loadGIS().then(() => new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      const tok = {
        at: resp.access_token,
        exp: Date.now() + (resp.expires_in || 3600) * 1000 - 5 * 60 * 1000,
      };
      localStorage.setItem(LS_TOKEN, JSON.stringify(tok));
      localStorage.setItem(LS_GRANTED, "1");
      resolve(tok.at);
    };
    tokenClient.requestAccessToken({ prompt });
  }));
}

/* ---------- 對外 API ---------- */
export async function isLinked() {
  return localStorage.getItem(LS_GRANTED) === "1";
}

/* 互動式連結（由使用者點擊觸發，會跳 Google 授權視窗） */
export async function linkCalendar() {
  await requestToken("consent");
}

export async function unlinkCalendar() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_TOKEN) || "null");
    if (c?.at && window.google?.accounts?.oauth2) {
      await new Promise(r => google.accounts.oauth2.revoke(c.at, r));
    }
  } catch {}
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_GRANTED);
}

export async function getAccessToken() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_TOKEN) || "null");
    if (c?.at && c.exp > Date.now() + 60 * 1000) return c.at;
  } catch {}
  if (localStorage.getItem(LS_GRANTED) !== "1") return null;
  try { return await requestToken(""); }
  catch { return null; }
}

/* ---------- Google Calendar API ---------- */
async function gcal(path, opts = {}) {
  const at = await getAccessToken();
  if (!at) throw new Error("日曆授權失效，請重新連結");
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`Google Calendar ${r.status}`);
  return r.status === 204 ? null : r.json();
}

export async function listEvents(timeMin, timeMax) {
  const q = new URLSearchParams({
    timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "250",
  });
  const d = await gcal(`/calendars/primary/events?${q}`);
  return (d.items || []).filter(e => e.status !== "cancelled");
}

export async function insertEvent({ summary, description, start, end }) {
  return gcal(`/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify({
      summary, description,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Taipei" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Taipei" },
      extendedProperties: { private: { dawn: "plan" } },
    }),
  });
}

/* 全天事件（date: "YYYY-MM-DD"） */
export async function insertAllDayEvent({ summary, description, date }) {
  const d = new Date(date + "T12:00:00");
  const next = new Date(d.getTime() + 86400000);
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return gcal(`/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify({
      summary, description,
      start: { date: iso(d) }, end: { date: iso(next) },
      extendedProperties: { private: { dawn: "plan" } },
    }),
  });
}

/* ---------- 空檔計算：某日 08:00–22:00 內、事件之間的縫隙 ---------- */
export function freeSlotsForDay(events, day, minMinutes = 20) {
  const start = new Date(day); start.setHours(8, 0, 0, 0);
  const end = new Date(day); end.setHours(22, 0, 0, 0);
  const busy = events
    .map(e => {
      const s = new Date(e.start?.dateTime || (e.start?.date + "T00:00:00"));
      const en = new Date(e.end?.dateTime || (e.end?.date + "T23:59:59"));
      return { s, en };
    })
    .filter(b => b.en > start && b.s < end)
    .sort((a, b) => a.s - b.s);
  const slots = [];
  let cur = start;
  for (const b of busy) {
    if (b.s > cur && (b.s - cur) / 60000 >= minMinutes) slots.push({ start: new Date(cur), end: new Date(b.s) });
    if (b.en > cur) cur = b.en;
  }
  if ((end - cur) / 60000 >= minMinutes) slots.push({ start: new Date(cur), end: new Date(end) });
  return slots;
}

export function fmtTime(d) {
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function fmtDay(d) {
  return d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
}
