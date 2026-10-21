/* 商店頁：商品列表 / 購買 / 背包 / 雷達圖詳情 */
import { supabase, getUser, getProfile } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js?v=theme001";

await renderTopbar("market.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const view = document.getElementById("m-view");
const invEl = document.getElementById("m-inv");
const balEl = document.getElementById("m-balance");

let balance = 0;
let allItems = [];
let activeCat = "全部";

/* 五維雷達圖（SVG） */
const STATS = [
  ["atk", "攻擊"],
  ["def", "防禦"],
  ["dur", "續航"],
  ["ver", "泛用"],
  ["rar", "稀有"],
];
function radarChart(item) {
  const size = 200, cx = 100, cy = 100, R = 70;
  const n = STATS.length;
  const pt = (i, val) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (R * Math.min(100, Math.max(0, val))) / 100;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  /* 背景網格 */
  let grid = "";
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    const pts = STATS.map((_, i) => pt(i, frac * 100).join(",")).join(" ");
    grid += `<polygon points="${pts}" fill="none" stroke="var(--wash-12)" stroke-width="1"/>`;
  }
  /* 軸線＋標籤 */
  let axes = "";
  STATS.forEach(([key, label], i) => {
    const [x, y] = pt(i, 100);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--wash-12)"/>`;
    const [lx, ly] = pt(i, 125);
    axes += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
      fill="var(--paper-400)" font-size="11">${label}</text>`;
  });
  /* 數值多邊形 */
  const vals = STATS.map(([k]) => Number(item[k]) || 0);
  const poly = vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const dots = vals.map((v, i) => {
    const [x, y] = pt(i, v);
    return `<circle cx="${x}" cy="${y}" r="3" fill="var(--brass-400)"/>`;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${grid}${axes}
    <polygon points="${poly}" fill="oklch(0.72 0.14 80 / 0.25)" stroke="var(--brass-400)" stroke-width="2"/>
    ${dots}</svg>`;
}

/* 商品詳情彈窗 */
function showDetail(item) {
  let modal = document.getElementById("item-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "item-modal";
    modal.className = "onboarding";
    document.body.appendChild(modal);
  }
  const vals = STATS.map(([k, label]) => `
    <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;">
      <span style="color:var(--paper-400);">${label}</span>
      <span class="num-sm" style="color:var(--brass-400);">${Number(item[k]) || 0}</span>
    </div>`).join("");
  modal.innerHTML = `<div class="box" style="max-width:380px;text-align:center;">
    <span class="tag">${esc(item.category || "其他")}</span>
    <h2 style="margin:8px 0;">${esc(item.name)}</h2>
    <p style="color:var(--paper-400);font-size:13px;margin-bottom:12px;">${esc(item.description || "")}</p>
    ${radarChart(item)}
    <div style="margin:12px 0;text-align:left;">${vals}</div>
    <div class="price" style="font-size:20px;margin-bottom:16px;">${Number(item.price).toLocaleString()} <small>星砂</small></div>
    <div style="display:flex;gap:8px;justify-content:center;">
      <button class="btn ${balance >= item.price ? "btn-primary" : "btn-ghost"}"
        id="modal-buy" ${balance >= item.price ? "" : "disabled"}>
        ${balance >= item.price ? "購買" : "餘額不足"}</button>
      <button class="btn btn-ghost" id="modal-close">關閉</button>
    </div></div>`;
  modal.querySelector("#modal-close").onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  const buyBtn = modal.querySelector("#modal-buy");
  if (buyBtn && !buyBtn.disabled) {
    buyBtn.onclick = () => { modal.remove(); buy(item.id, Number(item.price), item.name, buyBtn); };
  }
}

async function refreshBalance() {
  try {
    const p = await getProfile(user.id);
    balance = p.points ?? 0;
    balEl.textContent = balance.toLocaleString();
  } catch (e) {
    balEl.textContent = "—";
  }
}

function renderItems() {
  const cats = ["全部", ...new Set(allItems.map(i => i.category || "其他"))];
  const list = activeCat === "全部" ? allItems : allItems.filter(i => (i.category || "其他") === activeCat);
  if (!list.length) {
    view.innerHTML = `<div class="cat-tabs">${cats.map(c =>
      `<button class="btn ${c === activeCat ? "btn-primary" : "btn-ghost"}" data-cat="${esc(c)}"
        style="padding:6px 14px;font-size:13px;">${esc(c)}</button>`).join("")}</div>
      <div class="state-empty"><p>這個分類還沒有商品</p></div>`;
  } else {
    view.innerHTML = `<div class="cat-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">${cats.map(c =>
      `<button class="btn ${c === activeCat ? "btn-primary" : "btn-ghost"}" data-cat="${esc(c)}"
        style="padding:6px 14px;font-size:13px;">${esc(c)}</button>`).join("")}</div>
      <div class="shop-grid">${list.map(item => `
        <div class="card shop-item" data-detail="${item.id}" style="cursor:pointer;">
          <span class="tag">${esc(item.category || "其他")}</span>
          <h2>${esc(item.name)}</h2>
          <p class="desc">${esc(item.description || "")}</p>
          <div class="price">${Number(item.price).toLocaleString()} <small>星砂</small></div>
          <button class="btn ${balance >= item.price ? "btn-primary" : "btn-ghost"}"
            data-buy="${item.id}" data-price="${item.price}" data-name="${esc(item.name)}"
            ${balance >= item.price ? "" : "disabled"}>
            ${balance >= item.price ? "購買" : "餘額不足"}
          </button>
        </div>`).join("")}</div>`;
  }
  view.querySelectorAll("[data-cat]").forEach(btn => {
    btn.onclick = () => { activeCat = btn.dataset.cat; renderItems(); };
  });
  /* 點卡片看詳情＋雷達圖（點購買按鈕不觸發） */
  view.querySelectorAll("[data-detail]").forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest("[data-buy]")) return;
      const item = allItems.find(i => String(i.id) === card.dataset.detail);
      if (item) showDetail(item);
    };
  });
  view.querySelectorAll("[data-buy]").forEach(btn => {
    btn.onclick = () => buy(btn.dataset.buy, Number(btn.dataset.price), btn.dataset.name, btn);
  });
}

async function load() {
  view.innerHTML = `<div class="state-loading"><div class="skeleton" style="height:160px"></div></div>`;
  await refreshBalance();
  try {
    const { data: items, error } = await supabase.from("shop_items")
      .select("*").order("price", { ascending: true });
    if (error) throw error;
    /* 前端去重：同一 name 只保留第一筆（防 DB 重複資料） */
    const seen = new Set();
    allItems = (items || []).filter(i => {
      if (seen.has(i.name)) return false;
      seen.add(i.name);
      return true;
    });
    if (!allItems.length) {
      view.innerHTML = `<div class="state-empty"><p>商店還沒有上架商品</p></div>`;
    } else {
      renderItems();
    }
  } catch (e) {
    view.innerHTML = `<div class="state-error">
      <p>讀取失敗：${esc(e.message)}</p>
      <button class="btn btn-primary" id="m-retry">重試</button></div>`;
    document.getElementById("m-retry").onclick = load;
  }
  loadInventory();
}

async function loadInventory() {
  try {
    const { data, error } = await supabase.from("inventory")
      .select("quantity, shop_items(name)").eq("user_id", user.id);
    if (error) throw error;
    if (!data || !data.length) {
      invEl.innerHTML = `<p class="label">背包是空的</p>`;
      return;
    }
    invEl.innerHTML = data.map(r => `
      <div class="inv-row">
        <span>${esc(r.shop_items?.name || "未知物品")}</span>
        <span class="qty">× ${r.quantity}</span>
      </div>`).join("");
  } catch (e) {
    invEl.innerHTML = `<p class="label">讀取失敗</p>`;
  }
}

async function buy(itemId, price, name, btn) {
  if (balance < price) { toast("星砂不足"); return; }
  if (!confirm(`確定花 ${price} 星砂購買「${name}」嗎？`)) return;
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = "購買中…";
  try {
    // 1. 原子扣款＋記帳（transfer_starsand 是 SECURITY DEFINER RPC，餘額不足會拋錯）
    const { error: e1 } = await supabase.rpc("transfer_starsand", {
      p_user_id: user.id, p_amount: -price, p_reason: `購買：${name}`,
    });
    if (e1) throw e1;

    // 2. 入庫（upsert）
    const { data: existing } = await supabase.from("inventory")
      .select("quantity").eq("user_id", user.id).eq("item_id", itemId).maybeSingle();
    if (existing) {
      const { error: e3 } = await supabase.from("inventory")
        .update({ quantity: existing.quantity + 1 })
        .eq("user_id", user.id).eq("item_id", itemId);
      if (e3) throw e3;
    } else {
      const { error: e3 } = await supabase.from("inventory").insert({
        user_id: user.id, item_id: itemId, quantity: 1,
      });
      if (e3) throw e3;
    }

    toast(`已購買：${name}`);
    load(); // 重新整理餘額、按鈕狀態、背包
  } catch (e) {
    toast(`購買失敗：${e.message}`);
    btn.disabled = false;
    btn.textContent = origText;
  }
}

load();
