/* 曙光學習 — Google Classroom 整合（GIS 前端授權版）
 * 沿用 gcal.js 的 GIS 模式：瀏覽器直接拿 access token，不需後端。
 * 唯讀：課程列表＋待交作業。scope 屬敏感範圍，測試模式下僅白名單帳號可用。
 */
const CLIENT_ID = "583042386888-ktguvbjpb4ior7j8qs4t4d8fpck77vgc.apps.googleusercontent.com";
export const CR_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
].join(" ");
const LS_TOKEN = "cr_token_cache";
const LS_GRANTED = "cr_granted";
const LS_WORK = "cr_work_cache";
const LS_FEAT = "dawn_feat_classroom"; /* 功能開關：預設關，需使用者主動啟用 */
const WORK_TTL = 15 * 60 * 1000; /* 作業快取 15 分鐘 */

/* ---------- 功能開關（選用功能：設定頁＋新手導引可開） ---------- */
export function isEnabled() {
  return localStorage.getItem(LS_FEAT) === "1";
}
export function setEnabled(v) {
  localStorage.setItem(LS_FEAT, v ? "1" : "0");
  if (!v) {
    /* 關閉時一併清除授權與快取 */
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_GRANTED);
    localStorage.removeItem(LS_WORK);
  }
}

let tokenClient = null;
let gisReady = null;

function loadGIS() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const init = () => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: CR_SCOPES,
          callback: () => {},
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

export async function isLinked() {
  return localStorage.getItem(LS_GRANTED) === "1";
}

export async function linkClassroom() {
  localStorage.removeItem(LS_WORK);
  await requestToken("consent");
}

export async function unlinkClassroom() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_TOKEN) || "null");
    if (c?.at && window.google?.accounts?.oauth2) {
      await new Promise(r => google.accounts.oauth2.revoke(c.at, r));
    }
  } catch {}
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_GRANTED);
  localStorage.removeItem(LS_WORK);
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

async function cr(path) {
  const at = await getAccessToken();
  if (!at) throw new Error("Classroom 授權失效，請重新連結");
  const r = await fetch(`https://classroom.googleapis.com/v1${path}`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  if (r.status === 403) throw new Error("無權限：此帳號尚未加入測試人員名單");
  if (!r.ok) throw new Error(`Classroom API ${r.status}`);
  return r.json();
}

export async function listCourses() {
  const d = await cr(`/courses?studentId=me&courseStates=ACTIVE&pageSize=100`);
  return d.courses || [];
}

async function listCourseWork(courseId) {
  const d = await cr(`/courses/${courseId}/courseWork?courseWorkStates=PUBLISHED&pageSize=100`);
  return d.courseWork || [];
}

async function mySubmissionState(courseId, workId) {
  try {
    const d = await cr(`/courses/${courseId}/courseWork/${workId}/studentSubmissions?userId=me&pageSize=1`);
    const s = (d.studentSubmissions || [])[0];
    return s?.state || null; /* NEW / CREATED / TURNED_IN / RETURNED / RECLAIMED_BY_STUDENT */
  } catch { return null; }
}

function dueDateOf(w) {
  if (!w.dueDate) return null;
  const d = new Date(w.dueDate.year, w.dueDate.month - 1, w.dueDate.day);
  if (w.dueTime) d.setHours(w.dueTime.hours || 23, w.dueTime.minutes || 59, 0, 0);
  else d.setHours(23, 59, 0, 0);
  return d;
}

/* 未繳交的作業：近 7 天逾期＋未來到期，依截止日排序 */
export async function upcomingWork({ force = false } = {}) {
  try {
    const cached = JSON.parse(localStorage.getItem(LS_WORK) || "null");
    if (!force && cached?.ts && Date.now() - cached.ts < WORK_TTL) return cached.data;
  } catch {}
  const courses = await listCourses();
  const nameOf = Object.fromEntries(courses.map(c => [c.id, c.name]));
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  let items = [];
  for (const c of courses) {
    const works = await listCourseWork(c.id);
    for (const w of works) {
      const due = dueDateOf(w);
      if (!due || due < weekAgo) continue;
      items.push({
        courseId: c.id, course: nameOf[c.id] || "",
        id: w.id, title: w.title || "(無標題)",
        due: due.getTime(), link: w.alternateLink || "",
      });
    }
  }
  items.sort((a, b) => a.due - b.due);
  /* 查繳交狀態（只查前 20 筆，太多會慢） */
  const check = items.slice(0, 20);
  const states = await Promise.all(check.map(i => mySubmissionState(i.courseId, i.id)));
  const done = new Set(["TURNED_IN", "RETURNED"]);
  items = items.filter((it, i) => i >= check.length || !done.has(states[i]));
  items = items.map((it, i) => ({ ...it, state: i < check.length ? states[i] : null }));
  try { localStorage.setItem(LS_WORK, JSON.stringify({ ts: Date.now(), data: items })); } catch {}
  return items;
}

export function fmtDue(ts) {
  const d = new Date(ts);
  const now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((day - today) / 86400000);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (diff < 0) return { text: `${md}（逾期 ${-diff} 天）`, over: true };
  if (diff === 0) return { text: `${md}（今天截止）`, over: false, urgent: true };
  if (diff === 1) return { text: `${md}（明天截止）`, over: false, urgent: true };
  return { text: `${md}（剩 ${diff} 天）`, over: false };
}
