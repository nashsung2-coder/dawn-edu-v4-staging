/* 知識庫 v4：公開節點瀏覽 + 我的節點 + 搜尋 + 按讚 */
import { supabase } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, md, ensureProfile} from "../core/ui.js?v=fixed002";
import { createEditor, renderBlocks, blocksText, newBlock } from "../core/blocks.js?v=fixed002";

await renderTopbar("knowledge.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const v = document.getElementById("v");
const qEl = document.getElementById("q");
let mode = "all"; // all | mine
let activeCat = "全部";
let curPage = 1;
const PAGE_SIZE = 12;
// 從群島跳轉：?cat=xxx 預選分類
try {
  const _sp = new URLSearchParams(location.search);
  const urlCat = _sp.get("cat");
  if (urlCat) { activeCat = urlCat; mode = "mine"; }
  if (_sp.get("mode") === "mine") mode = "mine";
} catch {}
let cache = [];

function skeleton() {
  v.innerHTML = `<div class="skeleton" style="height:96px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:96px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:96px"></div>`;
}

async function fetchNodes() {
  // 注意：is_public 欄位可能不存在，不做服務端篩選，全取後客戶端處理
  // supabase-js 查詢錯誤放在 result.error，不會 throw，必須明確檢查
  try {
    const { data, error } = await supabase.from("knowledge_nodes")
      .select("id,user_id,title,content,category,is_public,created_at").limit(200);
    if (error) {
      console.error("載入節點失敗:", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("載入節點異常:", e.message);
    return [];
  }
}

function textOf(n) {
  let contentText = n.content || "";
  try {
    const parsed = JSON.parse(n.content || "");
    if (parsed && parsed.blocks) contentText = blocksText(parsed.blocks);
    else if (Array.isArray(parsed) && parsed.length && parsed[0].type) contentText = blocksText(parsed);
  } catch {}
  const q = n.question || (() => { try { return JSON.parse(n.content || "").question || ""; } catch { return ""; } })();
  return [n.title, q, contentText, n.explanation, (n.concepts || []).join(" ")].filter(Boolean).join(" ");
}

function bindCatTabs() {
  v.querySelectorAll("[data-kcat]").forEach(btn => {
    btn.onclick = () => { activeCat = btn.dataset.kcat; curPage = 1; render(); };
  });
}

/* 跳轉到對戰驗證：帶節點內容 */
window.verifyNode = function(id) {
  const n = cache.find(x => x.id === id);
  if (!n) return;
  let text = "";
  try {
    const parsed = JSON.parse(n.content);
    if (parsed.blocks) {
      text = parsed.blocks.map(b => {
        const d = b.data || {};
        return d.text || d.code || d.explanation || d.concept || d.caption || "";
      }).filter(Boolean).join("\n");
    } else {
      text = n.content;
    }
  } catch { text = n.content || ""; }
  try { sessionStorage.setItem("verify_content", text.slice(0, 5000)); } catch {}
  const params = new URLSearchParams({ topic: n.title || "", from: "verify" });
  location.href = "quiz.html?" + params.toString();
};

/* 從 localStorage 載入未發布草稿 */
function loadDrafts() {
  const drafts = [];
  const prefix = `dawn_draft_${user.id}_`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        const d = JSON.parse(localStorage.getItem(key));
        const nodeId = key.slice(prefix.length);
        drafts.push({
          _draftKey: key,
          _nodeId: nodeId === "new" ? null : nodeId,
          title: d.title || "未命名草稿",
          question: d.question || "",
          category: d.category || "未分類",
          blocks: d.blocks || [],
          updatedAt: d.updatedAt,
        });
      } catch {}
    }
  }
  return drafts.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/* 分類樹：支援 "父/子" 格式 */
function buildCatTree(nodes) {
  const tree = {};
  for (const n of nodes) {
    const cat = n.category || "未分類";
    const parts = cat.split("/").map(s => s.trim()).filter(Boolean);
    if (parts.length === 1) {
      tree[parts[0]] = tree[parts[0]] || { children: new Set(), count: 0 };
      tree[parts[0]].count++;
    } else {
      const parent = parts[0], child = parts.slice(1).join("/");
      tree[parent] = tree[parent] || { children: new Set(), count: 0 };
      tree[parent].children.add(child);
      tree[parent].count++;
    }
  }
  return tree;
}
function matchCat(nodeCat, active) {
  if (active === "全部") return true;
  const nc = nodeCat || "未分類";
  return nc === active || nc.startsWith(active + "/");
}

function render() {
  const q = qEl.value.trim().toLowerCase();
  let list = cache;
  let drafts = [];
  if (mode === "all") {
    // 全部模式：只顯示公開的節點，或自己的節點
    list = list.filter(n => (n.is_public === true || n.is_public === "true") || n.user_id === user.id);
  } else {
    list = list.filter(n => n.user_id === user.id);
    drafts = loadDrafts();
    if (q) {
      drafts = drafts.filter(d =>
        (d.title + " " + d.question + " " + (d.blocks || []).map(b => b.data?.text || b.data?.code || "").join(" ")).toLowerCase().includes(q));
    }
  }
  if (q) list = list.filter(n => textOf(n).toLowerCase().includes(q));
  // 分類樹基於當前模式的列表（不含分類篩選），計數才準確
  const tree = buildCatTree(list);
  if (activeCat !== "全部") list = list.filter(n => matchCat(n.category, activeCat));
  const catTabs = `<div class="cat-tabs" style="margin-bottom:16px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <button class="btn ${activeCat === "全部" ? "btn-primary" : "btn-ghost"}" data-kcat="全部" style="padding:6px 14px;font-size:13px;">全部（${list.length}）</button>
      ${Object.entries(tree).map(([parent, info]) => `
        <button class="btn ${activeCat === parent || activeCat.startsWith(parent + "/") ? "btn-primary" : "btn-ghost"}" data-kcat="${esc(parent)}"
          style="padding:6px 14px;font-size:13px;">${esc(parent)}（${info.count}）</button>`).join("")}
    </div>
    ${(() => {
      const activeParent = Object.keys(tree).find(p => activeCat === p || activeCat.startsWith(p + "/"));
      if (!activeParent || !tree[activeParent].children.size) return "";
      return `<div style="display:flex;gap:6px;flex-wrap:wrap;padding-left:12px;border-left:2px solid oklch(0.75 0.15 80 / 0.3);">
        ${[...tree[activeParent].children].map(child => {
          const full = activeParent + "/" + child;
          return `<button class="btn ${activeCat === full ? "btn-primary" : "btn-ghost"}" data-kcat="${esc(full)}" style="padding:4px 10px;font-size:12px;">${esc(child)}</button>`;
        }).join("")}
      </div>`;
    })()}
  </div>`;

  // 分頁
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (curPage > totalPages) curPage = totalPages;
  const pageList = list.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const pageHtml = totalPages > 1 ? `<div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:20px;">
    <button class="btn btn-ghost btn-sm" id="pg-prev" ${curPage <= 1 ? "disabled" : ""}>‹ 上一頁</button>
    <span style="font-size:13px;color:var(--paper-400);">${curPage} / ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" id="pg-next" ${curPage >= totalPages ? "disabled" : ""}>下一頁 ›</button>
  </div>` : "";

  const draftHtml = drafts.length ? `<div style="margin-bottom:16px;">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--brass-300);">未發布草稿（${drafts.length}）</div>
    ${drafts.map(d => `
    <div class="card" style="border-style:dashed;margin-bottom:8px;cursor:pointer;" data-draft="${esc(d._draftKey)}">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="status-badge status-draft">草稿</span>
        <div style="font-size:14px;font-weight:600;">${esc(d.title)}</div>
        <span style="flex:1"></span>
        <span style="font-size:11px;color:var(--paper-400);">${d.updatedAt ? new Date(d.updatedAt).toLocaleString("zh-TW", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</span>
        <button class="btn btn-ghost btn-sm" data-draft-del="${esc(d._draftKey)}">刪除</button>
      </div>
      ${d.question ? `<div style="font-size:12px;color:var(--paper-400);margin-top:4px;">${esc(d.question)}</div>` : ""}
    </div>`).join("")}
  </div>` : "";

  if (!list.length && !drafts.length) {
    v.innerHTML = catTabs + `<div class="state-empty">
      <p>${q ? "沒有符合的節點" : (mode === "mine" ? "你還沒有建立知識節點" : "知識庫是空的")}</p>
    </div>`;
    bindCatTabs();
    return;
  }

  v.innerHTML = catTabs + draftHtml + pageList.map(n => {
    let body = n.explanation || n.answer || "";
    let bodyIsBlocks = false;
    let nodeMeta = {};
    try {
      const parsed = JSON.parse(n.content || "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.blocks) {
        nodeMeta = parsed; /* 精簡格式：{blocks, question, category, ...} */
        body = renderBlocks(parsed.blocks, esc);
        bodyIsBlocks = true;
      } else if (Array.isArray(parsed) && parsed.length && parsed[0].type) {
        body = renderBlocks(parsed, esc);
        bodyIsBlocks = true;
      } else { body = n.content || body; }
    } catch { body = n.content || body; }
    const nQuestion = n.question || nodeMeta.question || "";
    const nCategory = n.category || nodeMeta.category || "未分類";
    const nConcepts = n.concepts || nodeMeta.concepts || [];
    const title = n.title || nQuestion || "未命名節點";
    const tags = nConcepts.map(c => `<span class="tag">${esc(c)}</span>`).join("");
    const cat = `<span class="tag" style="border-color:var(--brass-400);color:var(--brass-400);">${esc(nCategory)}</span>`;
    const up = n.upvotes ?? 0;
    const owner = n.owner_name ? ` · ${esc(n.owner_name)}` : "";
    const isMine = n.user_id === user.id;
    const editBtn = isMine ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();location.href='node-editor.html?id=${n.id}'">編輯</button>` : "";
    const battleBtn = `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();verifyNode('${n.id}')">驗證</button>`;
    // 超緊湊單行卡片
    return `<div class="card node" data-id="${n.id}" style="padding:10px 14px;margin-bottom:6px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="tag" style="border-color:var(--brass-400);color:var(--brass-400);font-size:11px;padding:2px 8px;flex-shrink:0;">${esc(nCategory)}</span>
        <div class="title" style="font-size:14px;margin:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(title)}</div>
        <span data-upcount style="font-size:12px;color:var(--paper-400);flex-shrink:0;">▲ ${up}</span>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-ghost upbtn" style="padding:3px 8px;font-size:12px;" data-up="${n.id}">讚</button>
          <button class="btn btn-ghost hide-mobile" style="padding:3px 8px;font-size:12px;" onclick="event.stopPropagation();verifyNode('${n.id}')">驗證</button>
          ${isMine ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:12px;" onclick="event.stopPropagation();location.href='node-editor.html?id=${n.id}'">編輯</button>` : ""}
          ${isMine ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:12px;color:var(--signal-red);border-color:var(--signal-red);" data-del="${n.id}">刪除</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("") + pageHtml;

  bindCatTabs();
  const pgPrev = document.getElementById("pg-prev");
  const pgNext = document.getElementById("pg-next");
  if (pgPrev) pgPrev.onclick = () => { if (curPage > 1) { curPage--; render(); window.scrollTo(0, 0); } };
  if (pgNext) pgNext.onclick = () => { curPage++; render(); window.scrollTo(0, 0); };

  /* 節點卡片：點擊開啟獨立閱讀頁 */
  v.querySelectorAll(".card.node").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      location.href = `node.html?id=${el.dataset.id}`;
    });
  });

  /* 草稿：點擊進入編輯器繼續編輯 */
  v.querySelectorAll("[data-draft]").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-draft-del]")) return;
      const key = el.dataset.draft;
      const prefix = `dawn_draft_${user.id}_`;
      const nodeId = key.slice(prefix.length);
      location.href = nodeId === "new" ? "node-editor.html" : `node-editor.html?id=${nodeId}`;
    });
  });
  v.querySelectorAll("[data-draft-del]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (confirm("確定刪除這份草稿？")) {
        localStorage.removeItem(btn.dataset.draftDel);
        render();
      }
    });
  });

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
  // 讀取已按讚記錄
  let likedIds = [];
  try { likedIds = JSON.parse(localStorage.getItem("dawn_liked") || "[]"); } catch {}
  v.querySelectorAll("[data-up]").forEach(btn => {
    // 已按讚的按鈕顯示狀態
    if (likedIds.includes(btn.dataset.up)) {
      btn.style.color = "var(--brass-300)";
      btn.style.borderColor = "var(--brass-400)";
      btn.textContent = "已讚";
    }
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.up;
      // 已按讚則取消
      let liked = [];
      try { liked = JSON.parse(localStorage.getItem("dawn_liked") || "[]"); } catch {}
      const node = cache.find(n => String(n.id) === String(id));
      const isLiked = liked.includes(id);
      const newCount = Math.max(0, (node?.upvotes ?? 0) + (isLiked ? -1 : 1));
      btn.disabled = true;
      try {
        /* 嘗試寫入資料庫（upvotes 欄位可能不存在，失敗則只更新本地） */
        try {
          const { error } = await supabase.from("knowledge_nodes").update({ upvotes: newCount }).eq("id", id);
          if (error && !/column/i.test(error.message)) throw error;
        } catch {}
        if (node) node.upvotes = newCount;
        // 更新本地按讚記錄（支援取消）
        try {
          let liked2 = JSON.parse(localStorage.getItem("dawn_liked") || "[]");
          if (isLiked) liked2 = liked2.filter(x => x !== id);
          else if (!liked2.includes(id)) liked2.push(id);
          localStorage.setItem("dawn_liked", JSON.stringify(liked2));
        } catch {}
        // 只更新數字，不重 render（保留滾動位置）
        const numEl = btn.parentElement?.parentElement?.querySelector("[data-upcount]");
        if (numEl) numEl.textContent = `▲ ${newCount}`;
        if (isLiked) {
          btn.style.color = ""; btn.style.borderColor = ""; btn.textContent = "讚";
        } else {
          btn.style.color = "var(--brass-300)"; btn.style.borderColor = "var(--brass-400)"; btn.textContent = "已讚";
        }
        btn.disabled = false;
        toast(isLiked ? "已取消讚" : "已按讚");
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
  curPage = 1; activeCat = "全部";
  e.target.classList.add("on");
  document.getElementById("tab-mine").classList.remove("on");
  render();
};
document.getElementById("tab-mine").onclick = e => {
  mode = "mine";
  curPage = 1; activeCat = "全部";
  e.target.classList.add("on");
  document.getElementById("tab-all").classList.remove("on");
  render();
};
document.getElementById("go").onclick = render;
qEl.addEventListener("keydown", e => { if (e.key === "Enter") render(); });


/* ===== 提問引導：以問題為入口的學習流程 ===== */
(function initAskGuide() {
  const askQ = document.getElementById("ask-q");
  const askGo = document.getElementById("ask-go");
  const askActions = document.getElementById("ask-actions");
  const askKeyword = document.getElementById("ask-keyword");
  if (!askQ || !askGo) return;

  function startAsk(question) {
    question = (question || "").trim();
    if (!question) { toast("請先輸入一個問題"); return; }
    /* 1. 用問題關鍵字搜尋知識庫 */
    qEl.value = question;
    render();
    /* 2. 顯示學習行動 */
    askKeyword.textContent = question.length > 20 ? question.slice(0, 20) + "…" : question;
    askActions.style.display = "block";
    /* 3. 捲動到結果區 */
    document.getElementById("v").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  askGo.onclick = () => startAsk(askQ.value);
  askQ.addEventListener("keydown", e => { if (e.key === "Enter") startAsk(askQ.value); });
  document.querySelectorAll(".ask-example").forEach(btn => {
    btn.onclick = () => { askQ.value = btn.dataset.q; startAsk(btn.dataset.q); };
  });

  /* 學習行動：帶著問題跳轉到對應工具 */
  document.getElementById("ask-feynman").onclick = () => {
    const q = askQ.value.trim();
    location.href = "feynman.html" + (q ? "?q=" + encodeURIComponent(q) : "");
  };
  document.getElementById("ask-quiz").onclick = () => {
    const q = askQ.value.trim();
    location.href = "quiz.html" + (q ? "?topic=" + encodeURIComponent(q) : "");
  };
  document.getElementById("ask-review").onclick = () => {
    location.href = "review.html";
  };
})();

// 初始化載入
load();
