/* v4 節點專用編輯器：Google Sites 風格 */
/* 草稿 → 本地儲存（localStorage）；發布 → Supabase；版本 → 快照紀錄 */
import { supabase, getProfile } from "../core/supabase.js?v=fixed001";
import { renderTopbar, requireAuth, toast, esc, ensureProfile } from "../core/ui.js?v=fixed001";
import { BLOCK_TYPES, newBlock, createEditor, renderBlocks, blocksText } from "../core/blocks.js?v=fixed001";

const params = new URLSearchParams(location.search);
const editId = params.get("id"); // 編輯現有節點時帶 id
const draftKey = () => `dawn_draft_${user.id}_${editId || "new"}`;
const versionKey = nodeId => `dawn_versions_${nodeId}`;

let user, blocks = [], isDirty = false, publishedNodeId = editId || null;
let saveTimer = null;

/* ---------- 初始化 ---------- */
try {
  await renderTopbar("knowledge.html");
  user = await requireAuth();
  await ensureProfile(supabase, user);
} catch (e) {
  document.getElementById("block-canvas").innerHTML = `<div class="state-empty"><p>載入失敗</p></div>`;
  throw e;
}

const $ = id => document.getElementById(id);
const titleInput = $("ed-title"), statusEl = $("ed-status");

/* ---------- 側邊欄 ---------- */
document.querySelectorAll(".sidebar-tab").forEach(t => {
  t.onclick = () => {
    document.querySelectorAll(".sidebar-tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".sidebar-panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $(`panel-${t.dataset.tab}`).classList.add("active");
  };
});
$("btn-versions").onclick = () => {
  document.querySelector('[data-tab="versions"]').click();
  openSidebar();
};
function openSidebar() {
  if (window.innerWidth <= 768) $("editor-sidebar").classList.add("open");
}
$("btn-sidebar").onclick = () => $("editor-sidebar").classList.toggle("open");
if (window.innerWidth <= 768) $("btn-sidebar").style.display = "";

/* ---------- 插入面板 ---------- */
$("insert-grid").innerHTML = BLOCK_TYPES.map(b =>
  `<div class="insert-item" data-type="${b.type}"><span class="ico">${b.icon}</span>${b.label}</div>`).join("");
$("insert-grid").querySelectorAll(".insert-item").forEach(el => {
  el.onclick = () => { addBlock(el.dataset.type); openSidebar(); };
});
$("btn-add-block").onclick = () => {
  document.querySelector('[data-tab="insert"]').click();
  openSidebar();
};

/* ---------- 區塊編輯 ---------- */
function addBlock(type) {
  blocks = [...getCurrentBlocks(), newBlock(type)];
  renderCanvas();
  markDirty();
}
let editor = null;
function renderCanvas() {
  if (!editor) {
    editor = createEditor($("block-canvas"), esc, blocks, {
      onChange: (newBlocks) => { blocks = newBlocks; markDirty(); },
    });
  } else {
    editor.setBlocks(blocks);
  }
}
function getCurrentBlocks() {
  return editor ? editor.getBlocks() : blocks;
}

/* ---------- 草稿自動儲存（本地） ---------- */
function collectData() {
  return {
    title: titleInput.value.trim(),
    question: $("ed-question").value.trim(),
    category: $("ed-category").value.trim(),
    concepts: $("ed-concepts").value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
    isPublic: $("ed-public").checked,
    blocks: getCurrentBlocks(),
    updatedAt: new Date().toISOString(),
  };
}
function markDirty() {
  isDirty = true;
  setStatus("saving", "儲存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 1500);
}
function saveDraft() {
  try {
    localStorage.setItem(draftKey(), JSON.stringify(collectData()));
    isDirty = false;
    setStatus(publishedNodeId ? "published" : "draft", publishedNodeId ? "已發布 · 草稿已儲存" : "草稿已儲存");
  } catch (e) { setStatus("draft", "草稿"); }
}
function setStatus(kind, text) {
  statusEl.className = `status-badge status-${kind}`;
  statusEl.textContent = text;
}
// 標題/設定欄位變更也觸發自動儲存
[titleInput, $("ed-question"), $("ed-category"), $("ed-concepts"), $("ed-public")].forEach(el => {
  el.addEventListener("input", markDirty);
  el.addEventListener("change", markDirty);
});

/* ---------- 載入：草稿優先，其次為已發布節點 ---------- */
async function loadInitial() {
  // 1. 先看本地草稿
  try {
    const raw = localStorage.getItem(draftKey());
    if (raw) {
      const d = JSON.parse(raw);
      applyData(d);
      setStatus(publishedNodeId ? "published" : "draft", "已還原本地草稿");
      renderVersionList();
      return;
    }
  } catch {}
  // 2. 編輯現有節點：從資料庫載入
  if (editId) {
    const { data, error } = await supabase.from("knowledge_nodes").select("*").eq("id", editId).single();
    if (!error && data) {
      publishedNodeId = data.id;
      let meta = {}, blks = [];
      try {
        const p = JSON.parse(data.content || "");
        if (p && p.blocks) { meta = p; blks = p.blocks; }
        else if (Array.isArray(p)) blks = p;
      } catch {}
      applyData({
        title: data.title || "",
        question: data.question || meta.question || "",
        category: data.category || meta.category || "",
        concepts: data.concepts || meta.concepts || [],
        isPublic: data.is_public ?? meta.is_public ?? true,
        blocks: blks,
      });
      setStatus("published", "已發布");
    }
  }
  if (!blocks.length) blocks = [newBlock("paragraph")];
  renderCanvas();
  renderVersionList();
}
function applyData(d) {
  titleInput.value = d.title || "";
  $("ed-question").value = d.question || "";
  $("ed-category").value = d.category || "";
  $("ed-concepts").value = (d.concepts || []).join(", ");
  $("ed-public").checked = d.isPublic !== false;
  blocks = d.blocks || [newBlock("paragraph")];
  if (editor) { editor.setBlocks(blocks); } else { renderCanvas(); }
}

/* ---------- 預覽 ---------- */
$("btn-preview").onclick = () => {
  $("pv-title").textContent = titleInput.value.trim() || "未命名節點";
  $("pv-body").innerHTML = renderBlocks(getCurrentBlocks(), esc);
  $("preview-modal").style.display = "";
};
$("pv-close").onclick = () => $("preview-modal").style.display = "none";

/* ---------- 發布流程 ---------- */
$("btn-publish").onclick = () => {
  if (!titleInput.value.trim()) { toast("請先填寫標題"); titleInput.focus(); return; }
  if (!blocksText(getCurrentBlocks()).trim()) { toast("內容不能為空"); return; }
  $("pub-visibility").value = $("ed-public").checked ? "public" : "private";
  $("publish-modal").style.display = "";
};
$("pub-cancel").onclick = () => $("publish-modal").style.display = "none";
$("pub-confirm").onclick = async () => {
  $("publish-modal").style.display = "none";
  const d = collectData();
  const isPublic = $("pub-visibility").value === "public";
  $("ed-public").checked = isPublic;
  setStatus("saving", "發布中…");
  try {
    const content = JSON.stringify({
      blocks: d.blocks, question: d.question, category: d.category,
      concepts: d.concepts, is_public: isPublic, answer: blocksText(d.blocks),
    });
    let nodeId = publishedNodeId;
    if (nodeId) {
      // 更新現有節點（先試完整欄位，失敗降級）
      let { error } = await supabase.from("knowledge_nodes").update({
        title: d.title, question: d.question, answer: blocksText(d.blocks),
        content, category: d.category, concepts: d.concepts, is_public: isPublic,
      }).eq("id", nodeId);
      if (error && /column|schema cache/i.test(error.message)) {
        const r2 = await supabase.from("knowledge_nodes").update({ title: d.title, content }).eq("id", nodeId);
        error = r2.error;
      }
      if (error) throw error;
    } else {
      // 新建
      const full = {
        user_id: user.id, title: d.title, question: d.question,
        answer: blocksText(d.blocks), content, explanation: null,
        category: d.category || "未分類", concepts: d.concepts,
        is_public: isPublic, owner_name: user.email?.split("@")[0] || "旅人", source: "manual",
      };
      let { data, error } = await supabase.from("knowledge_nodes").insert(full).select("id").single();
      if (error && /column|schema cache/i.test(error.message)) {
        const r2 = await supabase.from("knowledge_nodes")
          .insert({ user_id: user.id, title: d.title, content }).select("id").single();
        data = r2.data; error = r2.error;
      }
      if (error) throw error;
      nodeId = data.id;
      publishedNodeId = nodeId;
    }
    // 建立版本快照
    saveVersion(nodeId, d);
    // 清除本地草稿（已發布）
    localStorage.removeItem(draftKey());
    isDirty = false;
    setStatus("published", "已發布");
    toast("發布成功！");
    renderVersionList();
  } catch (e) {
    setStatus("draft", "草稿");
    toast("發布失敗：" + e.message);
  }
};

/* ---------- 版本紀錄 ---------- */
function getVersions(nodeId) {
  try { return JSON.parse(localStorage.getItem(versionKey(nodeId)) || "[]"); }
  catch { return []; }
}
function saveVersion(nodeId, d) {
  const versions = getVersions(nodeId);
  versions.unshift({
    v: versions.length + 1,
    time: new Date().toISOString(),
    title: d.title,
    preview: blocksText(d.blocks).slice(0, 80),
    data: d,
  });
  try { localStorage.setItem(versionKey(nodeId), JSON.stringify(versions.slice(0, 20))); } catch {}
}
function renderVersionList() {
  const el = $("version-list");
  if (!publishedNodeId) {
    el.innerHTML = `<div class="state-empty"><p>尚無版本紀錄</p><p style="font-size:12px;">發布後會自動建立版本快照</p></div>`;
    return;
  }
  const versions = getVersions(publishedNodeId);
  if (!versions.length) {
    el.innerHTML = `<div class="state-empty"><p>尚無版本紀錄</p></div>`;
    return;
  }
  el.innerHTML = versions.map((v, i) => `
    <div class="version-item">
      <div class="v-time">${new Date(v.time).toLocaleString("zh-TW")}</div>
      <div class="v-label">版本 ${v.v} · ${esc(v.title)}</div>
      <div style="font-size:12px;color:var(--paper-400);margin-top:4px;">${esc(v.preview)}…</div>
      <div class="v-actions">
        <button class="btn btn-ghost btn-sm" data-restore="${i}">還原此版本</button>
      </div>
    </div>`).join("");
  el.querySelectorAll("[data-restore]").forEach(btn => {
    btn.onclick = () => {
      const v = versions[Number(btn.dataset.restore)];
      if (v && confirm(`確定還原到版本 ${v.v}？目前的編輯內容會被覆蓋。`)) {
        applyData(v.data);
        markDirty();
        toast(`已還原到版本 ${v.v}`);
      }
    };
  });
}

/* 離開前提醒未儲存 */
window.addEventListener("beforeunload", e => {
  if (isDirty) { e.preventDefault(); e.returnValue = ""; }
});

await loadInitial();
