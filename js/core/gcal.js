/* 曙光學習 — Google 日曆整合
 * 連結：透過 Supabase OAuth 向 Google 多要 calendar.events 權限（offline access），
 * refresh token 存 user_calendar_tokens（RLS 保護）。
 * 使用：access token 先用 OAuth 當下那顆，過期後經 Worker /cal/token 刷新。
 */
import { supabase } from "./supabase.js";

const WORKER = "https://dawn-llm-proxy.nashsung2.workers.dev";
export const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const LS_KEY = "gcal_token_cache";

/* ---------- 連結狀態 ---------- */
export async function isLinked(userId) {
  try {
    const { data } = await supabase.from("user_calendar_tokens")
      .select("user_id").eq("user_id", userId).maybeSingle();
    return !!data;
  } catch { return false; }
}

/* ---------- 啟動連結（整頁跳轉 OAuth，回來後由 captureProviderToken 收尾） ---------- */
export async function linkCalendar() {
  const redirectTo = location.href.split("#")[0];
  const { data: { user } } = await supabase.auth.getUser();
  const hasGoogle = (user?.identities || []).some(i => i.provider === "google");
  const opts = {
    scopes: CAL_SCOPE,
    queryParams: { access_type: "offline", prompt: "consent" },
    redirectTo,
  };
  const { error } = hasGoogle
    ? await supabase.auth.signInWithOAuth({ provider: "google", options: opts })
    : await supabase.auth.linkIdentity({ provider: "google", options: opts });
  if (error) throw error;
}

/* ---------- OAuth 回來後：把 provider refresh token 存進 DB（冪等） ---------- */
export async function captureProviderToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const rt = session?.provider_refresh_token;
    const uid = session?.user?.id;
    if (!rt || !uid) return false;
    const { error } = await supabase.from("user_calendar_tokens").upsert({
      user_id: uid, refresh_token: rt, updated_at: new Date().toISOString(),
    });
    if (error) return false;
    /* 順手快取當下的 access token */
    if (session.provider_token) {
      localStorage.setItem(LS_KEY, JSON.stringify({
        at: session.provider_token, exp: Date.now() + 50 * 60 * 1000,
      }));
    }
    return true;
  } catch { return false; }
}

/* ---------- 解除連結 ---------- */
export async function unlinkCalendar(userId) {
  try {
    await supabase.from("user_calendar_tokens").delete().eq("user_id", userId);
    localStorage.removeItem(LS_KEY);
  } catch {}
}

/* ---------- 取得有效的 access token ---------- */
export async function getAccessToken() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (c?.at && c.exp > Date.now() + 60 * 1000) return c.at;
  } catch {}
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const r = await fetch(`${WORKER}/cal/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.access_token) return null;
  localStorage.setItem(LS_KEY, JSON.stringify({
    at: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 - 5 * 60 * 1000,
  }));
  return d.access_token;
}

/* ---------- Google Calendar API ---------- */
async function gcal(path, opts = {}) {
  const at = await getAccessToken();
  if (!at) throw new Error("日曆 token 失效，請重新連結");
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
