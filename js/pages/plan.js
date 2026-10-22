/* 學習排程：接上 Google 日曆，用零碎時間排複習 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc } from "../core/ui.js?v=theme002";
import { isLinked, linkCalendar, unlinkCalendar,
         listEvents, insertEvent, insertAllDayEvent, freeSlotsForDay, fmtTime, fmtDay } from "../core/gcal.js?v=cal003";
import { isEnabled as crEnabled, isLinked as crLinked, linkClassroom,
         upcomingWork, fmtDue } from "../core/classroom.js?v=cr001";

let user;
const view = document.getElementById("plan-view");

function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

async function init() {
  await renderTopbar("plan");
  user = await requireAuth();
  const linked = await isLinked();
  if (!linked) return renderLink();
  renderMain();
}

/* ---------- 未連結 ---------- */
function renderLink() {
  view.innerHTML = `
    <div class="card" style="max-width:560px;margin:0 auto;text-align:center;padding:32px 24px;">
      <h2 style="font-size:18px;margin-bottom:12px;">連結你的 Google 日曆</h2>
      <p style="font-size:14px;color:var(--paper-400);line-height:1.8;margin-bottom:20px;">
        連結後，曙光學習會讀取你的行程空檔，<br>
        把到期複習自動排進零碎時間，<br>
        排好的計畫也會寫回你的日曆提醒你。
      </p>
      <button class="btn btn-primary" id="btn-link">連結 Google 日曆</button>
      <p style="font-size:11px;color:var(--paper-400);margin-top:16px;opacity:.7;">
        只會要求讀取與建立行程的權限；授權資料只存你帳號下，可隨時解除。
      </p>
    </div>`;
  document.getElementById("btn-link").onclick = async () => {
    try {
      await linkCalendar();
      location.reload();
    } catch (e) { toast("連結失敗：" + (e.message || e)); }
  };
}

/* ---------- 已連結：本週空檔＋待複習＋排程 ---------- */
async function renderMain() {
  view.innerHTML = `<p style="color:var(--paper-400);">讀取行程與複習進度…</p>
    <div class="skeleton" style="height:20px;width:60%;margin:16px 0 12px;"></div>
    <div class="skeleton" style="height:44px;margin-bottom:10px;border-radius:12px;"></div>
    <div class="skeleton" style="height:44px;border-radius:12px;"></div>`;
  try {
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    const [events, cards] = await Promise.all([
      listEvents(now, weekEnd).catch(() => { throw new Error("讀取日曆失敗，token 可能過期，請重新連結"); }),
      supabase.from("review_cards").select("category, next_review_at")
        .eq("user_id", user.id).lte("next_review_at", weekEnd.toISOString()).limit(200),
    ]);
    const dueCards = (cards.data || []).filter(c => new Date(c.next_review_at) <= now);
    const upcoming = (cards.data || []).filter(c => new Date(c.next_review_at) > now);
    const plan = buildPlan(events, dueCards, upcoming, now);
    renderPlan(events, dueCards, upcoming, plan, now);
  } catch (e) {
    view.innerHTML = `<div class="card"><p style="color:var(--signal-red);">${esc(e.message)}</p>
      <button class="btn btn-ghost" id="btn-unlink" style="margin-top:12px;">解除連結重試</button></div>`;
    document.getElementById("btn-unlink").onclick = async () => {
      await unlinkCalendar(); location.reload();
    };
  }
}

/* 零碎時間分配器：逾期優先，20–45 分鐘一塊，每天最多 4 塊 */
function buildPlan(events, dueCards, upcoming, now) {
  const catOf = c => (c.category || "綜合").trim() || "綜合";
  const pool = [];
  const byCat = {};
  dueCards.forEach(c => { const k = catOf(c); byCat[k] = byCat[k] || { over: 0, up: 0 }; byCat[k].over++; });
  upcoming.forEach(c => { const k = catOf(c); byCat[k] = byCat[k] || { over: 0, up: 0 }; byCat[k].up++; });
  /* 加權輪詢：逾期多的分類先排 */
  const cats = Object.entries(byCat).sort((a, b) => (b[1].over * 2 + b[1].up) - (a[1].over * 2 + a[1].up));
  const totalOver = dueCards.length;
  if (!cats.length) return [];
  const plan = [];
  let ci = 0;
  const today = dayStart(now);
  for (let d = 0; d < 7 && plan.filter(p => p).length < 20; d++) {
    const day = new Date(today); day.setDate(day.getDate() + d);
    const dayEvents = events.filter(e => {
      const s = new Date(e.start?.dateTime || e.start?.date);
      return dayStart(s).getTime() === day.getTime();
    });
    const slots = freeSlotsForDay(dayEvents, day, 20);
    let dayCount = 0;
    for (const s of slots) {
      if (dayCount >= 4) break;
      let len = Math.floor((s.end - s.start) / 60000);
      const blocks = len >= 70 ? 2 : 1;
      for (let b = 0; b < blocks && dayCount < 4; b++) {
        const blen = Math.min(blocks === 2 ? Math.floor(len / 2) : len, 45);
        if (blen < 20) break;
        const start = new Date(s.start.getTime() + b * blen * 60000);
        const end = new Date(start.getTime() + blen * 60000);
        const cat = cats[ci % cats.length][0]; ci++;
        const isOver = byCat[cat].over > 0;
        plan.push({ start, end, cat, over: isOver, mins: blen });
        dayCount++;
      }
    }
  }
  return plan.slice(0, 20);
}

function renderPlan(events, dueCards, upcoming, plan, now) {
  const today = dayStart(now);
  const todayEvents = events.filter(e => dayStart(new Date(e.start?.dateTime || e.start?.date)).getTime() === today.getTime());
  const evLine = e => {
    const s = e.start?.dateTime ? fmtTime(new Date(e.start.dateTime)) : "整天";
    return `<div class="plan-event"><span class="t">${esc(s)}</span><span>${esc(e.summary || "(無標題)")}</span></div>`;
  };
  const planRows = plan.map((p, i) => `
    <label class="plan-slot pop-in">
      <input type="checkbox" data-i="${i}" checked>
      <span class="when">${fmtDay(p.start)} ${fmtTime(p.start)}–${fmtTime(p.end)}</span>
      <span>曙光複習｜${esc(p.cat)}${p.over ? "（逾期先排）" : ""}・${p.mins} 分鐘</span>
    </label>`).join("");
  view.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:16px;margin-bottom:8px;">今日行程（${fmtDay(now)}）</h2>
      ${todayEvents.length ? todayEvents.map(evLine).join("") : `<p style="font-size:14px;color:var(--paper-400);">今天沒有行程，整天都是你的。</p>`}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:16px;margin-bottom:8px;">待複習</h2>
      <p style="font-size:14px;">逾期 <b style="color:var(--signal-red);">${dueCards.length}</b> 張・本週到期 <b>${upcoming.length}</b> 張</p>
      ${dueCards.length + upcoming.length === 0 ? `<p style="font-size:13px;color:var(--paper-400);margin-top:8px;">太棒了，目前沒有待複習，排程會以維持為主。</p>` : ""}
    </div>
    ${crEnabled() ? `<div class="card" style="margin-bottom:16px;" id="cr-plan-card">
      <h2 style="font-size:16px;margin-bottom:4px;">Classroom 待交作業</h2>
      <div id="cr-plan-list"><p style="font-size:13px;color:var(--paper-400);">讀取中…</p></div>
    </div>` : ""}
    <div class="card">
      <h2 style="font-size:16px;margin-bottom:4px;">建議排程（未來 7 天）</h2>
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">依照你的行事曆空檔排入零碎時間，確認後寫進 Google 日曆。</p>
      ${plan.length ? planRows : `<p style="font-size:14px;color:var(--paper-400);">未來 7 天找不到 20 分鐘以上的空檔，建議先清出行程再來排。</p>`}
      ${plan.length ? `<button class="btn btn-primary" id="btn-confirm" style="margin-top:16px;width:100%;">確認並寫入 Google 日曆</button>` : ""}
      <button class="btn btn-ghost" id="btn-unlink" style="margin-top:8px;width:100%;">解除日曆連結</button>
    </div>`;
  document.getElementById("btn-unlink").onclick = async () => {
    if (!confirm("確定解除 Google 日曆連結？")) return;
    await unlinkCalendar(); location.reload();
  };
  const btn = document.getElementById("btn-confirm");
  if (btn) btn.onclick = () => writePlan(plan);
  if (crEnabled()) renderClassroomCard().catch(e => console.error("classroom 載入失敗:", e));
}

/* ---------- Classroom 待交作業卡 ---------- */
async function renderClassroomCard() {
  const box = document.getElementById("cr-plan-list");
  if (!box) return;
  if (!await crLinked()) {
    box.innerHTML = `<p style="font-size:13px;color:var(--paper-400);margin-bottom:10px;">連結後可把作業截止日寫進行事曆。</p>
      <button class="btn btn-ghost btn-sm" id="cr-plan-link">連結 Classroom</button>`;
    document.getElementById("cr-plan-link").onclick = async () => {
      try { await linkClassroom(); renderClassroomCard(); }
      catch (e) { toast("連結失敗：" + e.message); }
    };
    return;
  }
  try {
    const items = await upcomingWork();
    if (!items.length) {
      box.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">近 7 天沒有待交作業。</p>`;
      return;
    }
    box.innerHTML = items.slice(0, 10).map((it, i) => {
      const f = fmtDue(it.due);
      const d = new Date(it.due);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return `<div class="plan-event">
        <span class="t" style="color:${f.over ? "var(--signal-red)" : "var(--brass-300)"};">${esc(f.text)}</span>
        <span style="flex:1;"><b>${esc(it.course)}</b> ${esc(it.title)}</span>
        <button class="btn btn-ghost btn-sm" data-cr-add="${i}" data-iso="${iso}"
          data-title="${esc(it.title)}" data-course="${esc(it.course)}" data-link="${esc(it.link)}">＋行事曆</button>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-cr-add]").forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await insertAllDayEvent({
            summary: `繳交｜${btn.dataset.title}`,
            description: `課程：${btn.dataset.course}\nClassroom：${btn.dataset.link}\n由曙光學習排入`,
            date: btn.dataset.iso,
          });
          toast("已加入行事曆");
          btn.textContent = "已加入";
        } catch (e) {
          toast("加入失敗：" + e.message);
          btn.disabled = false;
        }
      };
    });
  } catch (e) {
    box.innerHTML = `<p style="font-size:13px;color:var(--signal-red);">讀取失敗：${esc(e.message)}</p>
      <button class="btn btn-ghost btn-sm" id="cr-plan-retry" style="margin-top:8px;">重試</button>`;
    document.getElementById("cr-plan-retry").onclick = () => renderClassroomCard();
  }
}

async function writePlan(plan) {
  const checked = [...document.querySelectorAll(".plan-slot input:checked")].map(i => plan[+i.dataset.i]);
  if (!checked.length) { toast("至少選一個時段"); return; }
  const btn = document.getElementById("btn-confirm");
  btn.disabled = true; btn.textContent = "寫入中…";
  let ok = 0;
  for (const p of checked) {
    try {
      await insertEvent({
        summary: `曙光複習｜${p.cat}`,
        description: `由曙光學習排入的複習時段（${p.mins} 分鐘）。\n打開複習：https://edu.crestylon.org/pages/review.html`,
        start: p.start, end: p.end,
      });
      ok++;
    } catch (e) { toast(`寫入失敗：${e.message}`); break; }
  }
  toast(`已寫入 ${ok} 個行程到 Google 日曆`);
  btn.disabled = false; btn.textContent = "確認並寫入 Google 日曆";
}

init();
