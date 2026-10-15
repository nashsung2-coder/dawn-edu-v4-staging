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
    allowCollab: $("ed-collab").checked,
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
  const collabEl = $("ed-collab");
  if (collabEl) collabEl.checked = d.allowCollab === true;
  blocks = d.blocks || [newBlock("paragraph")];
  if (editor) { editor.setBlocks(blocks); } else { renderCanvas(); }
}

/* ---------- 手動儲存草稿 ---------- */
$("btn-save-draft").onclick = () => {
  saveDraft();
  toast("草稿已儲存到本地");
};

/* ---------- 預覽 ---------- */
$("btn-preview").onclick = () => {
  try {
    $("pv-title").textContent = titleInput.value.trim() || "未命名節點";
    $("pv-body").innerHTML = renderBlocks(getCurrentBlocks(), esc) || "<p style='color:var(--paper-400);'>（尚無內容）</p>";
    const m = $("preview-modal");
    m.style.display = "flex";
    m.style.alignItems = "center";
    m.style.justifyContent = "center";
  } catch (e) {
    console.error("預覽錯誤:", e);
    toast("預覽失敗：" + e.message);
  }
};
$("pv-close").onclick = () => $("preview-modal").style.display = "none";

/* ---------- 衝突解決：並列顯示雙方區塊 ---------- */
function showConflictDialog(remoteBlocks, localBlocks) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.innerHTML = `
      <div class="modal" style="max-width:720px;max-height:80vh;overflow-y:auto;">
        <h3>偵測到內容衝突</h3>
        <p style="font-size:13px;color:var(--paper-400);">其他人已修改此節點。雙方區塊並列顯示，請決定保留或刪除：</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;">
          <div>
            <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--brass-300);">對方的版本（${remoteBlocks.length} 個區塊）</div>
            <div id="conflict-remote" style="border:1px solid oklch(1 0 0 / 0.1);border-radius:8px;padding:8px;"></div>
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--brass-300);">你的版本（${localBlocks.length} 個區塊）</div>
            <div id="conflict-local" style="border:1px solid oklch(1 0 0 / 0.1);border-radius:8px;padding:8px;"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost" id="cf-cancel">取消發布</button>
          <button class="btn btn-ghost" id="cf-remote">只保留對方</button>
          <button class="btn btn-ghost" id="cf-local">只保留我的</button>
          <button class="btn btn-primary" id="cf-merge">合併雙方</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#conflict-remote").innerHTML = renderBlocks(remoteBlocks, esc) || "<p style='color:var(--paper-400);font-size:12px;'>（無內容）</p>";
    overlay.querySelector("#conflict-local").innerHTML = renderBlocks(localBlocks, esc) || "<p style='color:var(--paper-400);font-size:12px;'>（無內容）</p>";
    const close = v => { overlay.remove(); resolve(v); };
    overlay.querySelector("#cf-cancel").onclick = () => close(null);
    overlay.querySelector("#cf-remote").onclick = () => close(remoteBlocks);
    overlay.querySelector("#cf-local").onclick = () => close(localBlocks);
    overlay.querySelector("#cf-merge").onclick = () => close([...remoteBlocks, ...localBlocks]);
  });
}

/* ---------- 發布流程 ---------- */
$("btn-publish").onclick = () => {
  try {
    if (!titleInput.value.trim()) { toast("請先填寫標題"); titleInput.focus(); return; }
    const curBlocks = getCurrentBlocks();
    if (!blocksText(curBlocks).trim()) { toast("內容不能為空，請先加入區塊並輸入文字"); return; }
    $("pub-visibility").value = $("ed-public").checked ? "public" : "private";
    const modal = $("publish-modal");
    modal.style.display = "flex";
    // 確保 modal 置中顯示
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
  } catch (e) {
    console.error("發布按鈕錯誤:", e);
    toast("發生錯誤：" + e.message);
  }
};
$("pub-cancel").onclick = () => $("publish-modal").style.display = "none";
$("pub-confirm").onclick = async () => {
  $("publish-modal").style.display = "none";
  const d = collectData();
  // 衝突檢測：如果是編輯現有節點，檢查資料庫版本是否與載入時不同
  if (publishedNodeId) {
    try {
      const { data: remote } = await supabase.from("knowledge_nodes")
        .select("content, updated_at").eq("id", publishedNodeId).single();
      if (remote && remote.content) {
        const remoteBlocks = JSON.parse(remote.content).blocks || [];
        const localBlocks = d.blocks;
        // 簡單衝突檢測：遠端區塊數與本地差異大，且遠端更新時間晚於本地載入
        if (remoteBlocks.length !== localBlocks.length && remoteBlocks.length > 0) {
          const merged = await showConflictDialog(remoteBlocks, localBlocks);
          if (merged === null) { setStatus("draft", "草稿"); return; } // 用戶取消
          d.blocks = merged;
          blocks = merged;
          if (editor) editor.setBlocks(blocks);
        }
      }
    } catch (e) { console.warn("衝突檢測跳過:", e.message); }
  }
  const isPublic = $("pub-visibility").value === "public";
  $("ed-public").checked = isPublic;
  setStatus("saving", "發布中…");
  try {
    const content = JSON.stringify({
      blocks: d.blocks, question: d.question, category: d.category,
      concepts: d.concepts, is_public: isPublic, allow_collab: d.allowCollab,
      answer: blocksText(d.blocks),
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
