/* 知識庫 v4：公開節點瀏覽 + 我的節點 + 搜尋 + 按讚 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, md, ensureProfile} from "../core/ui.js";

await renderTopbar("knowledge.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const v = document.getElementById("v");
const qEl = document.getElementById("q");
let mode = "all"; // all | mine
let activeCat = "全部";
// 從群島跳轉：?cat=xxx 預選分類
try {
  const urlCat = new URLSearchParams(location.search).get("cat");
  if (urlCat) { activeCat = urlCat; mode = "mine"; }
} catch {}
let cache = [];

function skeleton() {
  v.innerHTML = `<div class="skeleton" style="height:96px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:96px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:96px"></div>`;
}

async function fetchNodes() {
  // 先嘗試帶 is_public 篩選；欄位不存在時降級為全取再客戶端過濾
  try {
    const { data, error } = await supabase.from("knowledge_nodes")
      .select("*").eq("is_public", true)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data || [];
  } catch (e) {
    const { data, error } = await supabase.from("knowledge_nodes")
      .select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).filter(n => n.is_public !== false);
  }
}

function textOf(n) {
  return [n.title, n.question, n.content, n.explanation, (n.concepts || []).join(" ")].filter(Boolean).join(" ");
}

function bindCatTabs() {
  v.querySelectorAll("[data-kcat]").forEach(btn => {
    btn.onclick = () => { activeCat = btn.dataset.kcat; render(); };
  });
}

function render() {
  const q = qEl.value.trim().toLowerCase();
  let list = cache;
  if (mode === "mine") list = list.filter(n => n.user_id === user.id);
  if (q) list = list.filter(n => textOf(n).toLowerCase().includes(q));
  if (activeCat !== "全部") list = list.filter(n => (n.category || "未分類") === activeCat);

  const cats = ["全部", ...new Set(cache.map(n => n.category || "未分類"))];
  const catTabs = `<div class="cat-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">${cats.map(c =>
    `<button class="btn ${c === activeCat ? "btn-primary" : "btn-ghost"}" data-kcat="${esc(c)}"
      style="padding:6px 14px;font-size:13px;">${esc(c)}</button>`).join("")}</div>`;

  if (!list.length) {
    v.innerHTML = catTabs + `<div class="state-empty">
      <p>${q ? "沒有符合的節點" : (mode === "mine" ? "你還沒有建立知識節點" : "知識庫是空的")}</p>
    </div>`;
    bindCatTabs();
    return;
  }

  v.innerHTML = catTabs + list.map(n => {
    const title = n.title || n.question || "未命名節點";
    const tags = (n.concepts || []).map(c => `<span class="tag">${esc(c)}</span>`).join("");
    const cat = `<span class="tag" style="border-color:var(--brass-400);color:var(--brass-400);">${esc(n.category || "未分類")}</span>`;
    const up = n.upvotes ?? 0;
    const owner = n.owner_name ? ` · ${esc(n.owner_name)}` : "";
    const body = n.content || n.explanation || n.answer || "";
    const isMine = n.user_id === user.id;
    return `<div class="card node" data-id="${n.id}">
      <div class="title">${esc(title)}</div>
      ${`<div class="tags">${cat}${tags}</div>`}
      ${body ? `<div class="body">${md(body)}</div>` : ""}
      <div class="meta">
        <span class="up">▲ <span class="num-sm">${up}</span></span>
        <span>${owner}</span>
        <button class="btn btn-ghost upbtn" style="padding:4px 12px;font-size:12px;" data-up="${n.id}">讚</button>
        ${isMine ? `<button class="btn btn-ghost" style="padding:4px 12px;font-size:12px;color:var(--signal-red);border-color:var(--signal-red);" data-del="${n.id}">刪除</button>` : ""}
      </div>
    </div>`;
  }).join("");

  bindCatTabs();

  v.querySelectorAll(".node").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-up]") || e.target.closest("[data-del]")) return;
      el.classList.toggle("open");
    });
  });
  v.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("確定要刪除這個知識節點嗎？")) return;
      btn.disabled = true;
      try {
        const { error } = await supabase.from("knowledge_nodes")
          .delete().eq("id", btn.dataset.del).eq("user_id", user.id);
        if (error) throw error;
        cache = cache.filter(n => String(n.id) !== String(btn.dataset.del));
        toast("已刪除");
        render();
      } catch (err) {
        toast("刪除失敗：" + err.message);
        btn.disabled = false;
      }
    });
  });
  v.querySelectorAll("[data-up]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      btn.disabled = true;
      try {
        const id = btn.dataset.up;
        /* 用 SECURITY DEFINER RPC 原子 +1（RLS 不允許直接改別人的節點） */
        const { data, error } = await supabase.rpc("increment_upvotes", { node_id: id });
        if (error) throw error;
        const node = cache.find(n => String(n.id) === String(id));
        if (node) node.upvotes = data ?? (node.upvotes ?? 0) + 1;
        render();
      } catch (err) {
        toast("按讚失敗，請稍後再試");
        btn.disabled = false;
      }
    });
  });
}

async function load() {
  skeleton();
  try {
    cache = await fetchNodes();
    render();
  } catch (e) {
    v.innerHTML = `<div class="state-empty">
      <p>讀取失敗：${esc(e.message)}</p>
      <button class="btn btn-primary" id="retry" style="margin-top:12px;">重試</button>
    </div>`;
    document.getElementById("retry").onclick = load;
  }
}

document.getElementById("tab-all").onclick = e => {
  mode = "all";
  e.target.classList.add("on");
  document.getElementById("tab-mine").classList.remove("on");
  render();
};
document.getElementById("tab-mine").onclick = e => {
  mode = "mine";
  e.target.classList.add("on");
  document.getElementById("tab-all").classList.remove("on");
  render();
};
document.getElementById("go").onclick = render;
qEl.addEventListener("keydown", e => { if (e.key === "Enter") render(); });

/* ===== 建立知識節點 ===== */
const modal = document.getElementById("node-modal");
document.getElementById("btn-new").onclick = () => {
  modal.style.display = "flex";
};
document.getElementById("nm-cancel").onclick = () => {
  modal.style.display = "none";
};
modal.addEventListener("click", e => {
  if (e.target === modal) modal.style.display = "none";
});

document.getElementById("nm-save").onclick = async () => {
  const title = document.getElementById("nm-title").value.trim();
  const question = document.getElementById("nm-q").value.trim();
  const answer = document.getElementById("nm-a").value.trim();
  if (!title || !question || !answer) {
    toast("請填寫標題、問題和答案");
    return;
  }
  const btn = document.getElementById("nm-save");
  btn.disabled = true;
  btn.textContent = "建立中…";
  try {
    await ensureProfile(supabase, user);
    const concepts = document.getElementById("nm-concepts").value
      .split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const { error } = await supabase.from("knowledge_nodes").insert({
      user_id: user.id,
      title,
      question,
      answer,
      content: answer,
      explanation: document.getElementById("nm-exp").value.trim() || null,
      category: document.getElementById("nm-cat").value.trim() || "未分類",
      concepts,
      is_public: document.getElementById("nm-public").checked,
      owner_name: user.email?.split("@")[0] || "旅人",
      source: "manual",
    });
    if (error) throw error;
    toast("知識節點已建立！");
    modal.style.display = "none";
    /* 清空表單 */
    ["nm-title", "nm-cat", "nm-q", "nm-a", "nm-exp", "nm-concepts"].forEach(id => {
      document.getElementById(id).value = "";
    });
    document.getElementById("nm-public").checked = true;
    /* 切到我的節點並重載 */
    mode = "mine";
    document.getElementById("tab-mine").classList.add("on");
    document.getElementById("tab-all").classList.remove("on");
    await load();
  } catch (e) {
    toast("建立失敗：" + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "建立";
  }
};

load();
