/* v4 節點專用編輯器：Google Sites 風格 */
/* 草稿 → 本地儲存（localStorage）；發布 → Supabase；版本 → 快照紀錄 */
import { supabase, getProfile } from "../core/supabase.js?v=fixed002";
import { ask, MODELS } from "../core/llm.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile } from "../core/ui.js?v=fixed002";
import { BLOCK_TYPES, newBlock, createEditor, renderBlocks, blocksText } from "../core/blocks.js?v=fixed002";

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
function loadGuidedDraft(g) {
  if (typeof titleInput !== "undefined") titleInput.value = g.title || "";
  const qEl = $("ed-question");
  if (qEl) qEl.value = g.question || "";
  // 載入 AI 生成的區塊（editor 是全域的區塊編輯器實例）
  if (g.blocks && g.blocks.length) {
    if (typeof editor !== "undefined" && editor && editor.setBlocks) {
      editor.setBlocks(g.blocks);
    } else {
      // editor 還沒好，等一下再試
      setTimeout(() => loadGuidedDraft(g), 500);
      return;
    }
  }
  toast("已載入引導式建立的內容，可以繼續編輯");
}
function collectData() {
  return {
    title: titleInput.value.trim(),
    question: $("ed-question").value.trim(),
    category: (() => {
      const main = $("ed-category").value.trim();
      const subEl = $("ed-subcategory");
      const sub = subEl ? subEl.value.trim() : "";
      return sub ? main + "/" + sub : main;
    })(),
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
// 字數統計：顯示在標題旁
function updateWordCount() {
  const d = collectData();
  const text = (d.title + " " + d.question + " " + (d.blocks || []).map(b => b.data?.text || b.data?.code || "").join(" ")).replace(/\s+/g, "");
  const wcEl = document.getElementById("ed-wordcount");
  if (wcEl) wcEl.textContent = `${text.length} 字`;
}
setInterval(updateWordCount, 2000);
// 標題/設定欄位變更也觸發自動儲存
[titleInput, $("ed-question"), $("ed-category"), $("ed-subcategory"), $("ed-concepts"), $("ed-public"), $("ed-collab")].forEach(el => {
  if (!el) return;
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
  const catParts = (d.category || "").split("/");
  $("ed-category").value = catParts[0] || "";
  const subEl = $("ed-subcategory");
  if (subEl) subEl.value = catParts.slice(1).join("/") || "";
  $("ed-concepts").value = (d.concepts || []).join(", ");
  $("ed-public").checked = d.isPublic !== false;
  const collabEl = $("ed-collab");
  if (collabEl) collabEl.checked = d.allowCollab === true;
  blocks = d.blocks || [newBlock("paragraph")];
  if (editor) { editor.setBlocks(blocks); } else { renderCanvas(); }
}

/* ---------- 快捷鍵 ---------- */
document.addEventListener("keydown", e => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  // Ctrl+S：儲存草稿（不觸發瀏覽器存檔）
  if (k === "s") {
    e.preventDefault();
    saveDraft();
    toast("草稿已儲存到本地");
  }
  // Ctrl+P：發布（避免瀏覽器列印）
  if (k === "p" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) {
    e.preventDefault();
    $("btn-publish").click();
  }
});

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



/* 簡易 Markdown 渲染：**粗體**、- 條列 */
function renderAiMd(text) {
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // 【通順】等標籤高亮
  html = html.replace(/(【通順】|【邏輯】|【糾錯】)/g, '<span style="color:var(--brass-300);font-weight:700;">$1</span>');
  const lines = html.split("\n");
  let out = "", inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*•]\s/.test(t)) {
      if (!inList) { out += "<ul style='margin:8px 0;padding-left:20px;'>"; inList = true; }
      out += `<li style="margin-bottom:6px;">${t.replace(/^[-*•]\s/, "")}</li>`;
    } else {
      if (inList) { out += "</ul>"; inList = false; }
      out += t ? `<p style="margin:8px 0;">${t}</p>` : "";
    }
  }
  if (inList) out += "</ul>";
  return `<div style="font-size:14px;line-height:1.8;word-break:break-word;overflow-wrap:anywhere;">${out}</div>`;
}

/* ---------- AI 寫作建議（懸浮側邊面板） ---------- */
async function runAiPolish() {
  const d = collectData();
  const text = blocksText(d.blocks || []);
  if (!text.trim()) { toast("先寫點內容再請 AI 建議"); return; }

  const panel = $("ai-polish-panel");
  const content = $("ai-polish-content");
  panel.style.display = "flex";
  $("ai-polish-fab").style.display = "none";
  content.innerHTML = `<p style="color:var(--paper-400);font-size:14px;">AI 正在閱讀你的內容…</p>`;

  try {
    const reply = await ask(
      `你是繁體中文寫作導師。閱讀學生的知識節點內容，從三個面向給建議：
1. 通順度：句子是否通順，有沒有語病或贅字
2. 邏輯清晰度：論述是否有條理，段落銜接是否自然
3. 事實糾錯：如果發現明顯的事實錯誤，直接指出並給正確資訊

格式要求：
- 用條列式，每點開頭標註【通順】【邏輯】或【糾錯】
- 具體指出問題句子，並給修改建議
- 語氣鼓勵但直接
- 不超過 300 字
- 如果內容已經很好，直接說「寫得很好」並簡單肯定`,
      `標題：${d.title || "無標題"}\n\n內容：\n${text}`
    );
    content.innerHTML = renderAiMd(reply);
  } catch (e) {
    content.innerHTML = `<p style="color:var(--signal-red);font-size:14px;">AI 建議失敗：${e.message}</p>`;
  }
}
$("btn-ai-polish").onclick = runAiPolish;
$("ai-polish-refresh").onclick = runAiPolish;
// 收合：面板隱藏，顯示懸浮按鈕
$("ai-polish-min").onclick = () => {
  $("ai-polish-panel").style.display = "none";
  $("ai-polish-fab").style.display = "block";
};
// 懸浮按鈕：重新展開
$("ai-polish-fab").onclick = () => {
  $("ai-polish-panel").style.display = "flex";
  $("ai-polish-fab").style.display = "none";
};
// 關閉：完全關閉
$("ai-polish-close").onclick = () => {
  $("ai-polish-panel").style.display = "none";
  $("ai-polish-fab").style.display = "none";
};


/* ---------- 發布前 AI 審核 ---------- */
async function aiPrePublishReview(d) {
  const text = blocksText(d.blocks || []);
  // 建立審核 modal
  let reviewModal = document.getElementById("ai-review-modal");
  if (!reviewModal) {
    reviewModal = document.createElement("div");
    reviewModal.id = "ai-review-modal";
    reviewModal.className = "modal-overlay";
    reviewModal.style.cssText = "display:none;align-items:center;justify-content:center;";
    reviewModal.innerHTML = `
      <div class="modal" style="max-width:560px;max-height:80vh;overflow-y:auto;">
        <h3 style="margin:0 0 16px;">AI 發布前審核</h3>
        <div id="ai-review-content"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="btn btn-ghost" id="ai-review-edit">回去修改</button>
          <button class="btn btn-primary" id="ai-review-confirm">確認發布</button>
        </div>
      </div>`;
    document.body.appendChild(reviewModal);
  }
  const content = document.getElementById("ai-review-content");
  reviewModal.style.display = "flex";
  content.innerHTML = `<p style="color:var(--paper-400);font-size:14px;">AI 正在審核你的內容…</p>`;

  return new Promise(async (resolve) => {
    document.getElementById("ai-review-edit").onclick = () => {
      reviewModal.style.display = "none";
      resolve(false);
    };
    document.getElementById("ai-review-confirm").onclick = () => {
      reviewModal.style.display = "none";
      resolve(true);
    };
    try {
      const reply = await ask(
        `你是知識庫內容審核員。用繁體中文審核學生的知識節點，判斷是否適合發布。
檢查項目：
1. 事實正確性：有無明顯錯誤
2. 完整性：內容是否過於空泛，有無實質知識點
3. 適當性：有無不當內容

輸出格式：
- 第一行必須是「通過」或「需修改」
- 之後條列具體問題（如果通過，簡單肯定即可）
- 不超過 200 字`,
        `標題：${d.title || "無標題"}\n分類：${d.category || "未分類"}\n\n內容：\n${text}`
      );
      const passed = reply.trim().startsWith("通過");
      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:20px;">${passed ? "✅" : "⚠️"}</span>
          <span style="font-weight:700;font-size:15px;color:${passed ? "#6ee7b7" : "#fcd34d"};">${passed ? "審核通過" : "建議修改"}</span>
        </div>
        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${reply.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      `;
      // 如果沒通過，預設停在修改（用戶仍可強制發布）
      if (!passed) {
        document.getElementById("ai-review-confirm").textContent = "仍要發布";
      } else {
        document.getElementById("ai-review-confirm").textContent = "確認發布";
      }
    } catch (e) {
      content.innerHTML = `<p style="font-size:14px;">AI 審核暫時無法使用，你可以直接發布。</p><p style="font-size:12px;color:var(--paper-400);">${e.message}</p>`;
    }
  });
}

/* ---------- 發布流程 ---------- */
$("btn-publish").onclick = () => {
  try {
    if (!titleInput.value.trim()) { toast("請先填寫標題"); titleInput.focus(); return; }
    const curBlocks = getCurrentBlocks();
    if (!blocksText(curBlocks).trim()) { toast("內容不能為空，請先加入區塊並輸入文字"); return; }
    if (!$("ed-category").value.trim()) {
      toast("請先填寫主分類再發布");
      $("ed-category").focus();
      const panelBtn = document.querySelector('[data-panel="panel-settings"]');
      if (panelBtn) panelBtn.click();
      return;
    }
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
  // AI 審核：發布前檢查內容品質
  const reviewOk = await aiPrePublishReview(d);
  if (!reviewOk) return; // 用戶選擇先修改
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
      // 更新現有節點（只用實際存在的欄位）
      const { error } = await supabase.from("knowledge_nodes").update({
        title: d.title, content, category: d.category || "未分類", is_public: isPublic,
      }).eq("id", nodeId);
      if (error) throw error;
    } else {
      // 新建（只用實際存在的欄位）
      const { data, error } = await supabase.from("knowledge_nodes")
        .insert({ user_id: user.id, title: d.title, content, category: d.category || "未分類", is_public: isPublic })
        .select("id").single();
      if (error) throw error;
      if (!data || !data.id) throw new Error("資料庫未回傳節點 ID（可能被 RLS 阻擋）");
      nodeId = data.id;
      publishedNodeId = nodeId;
      // 驗證：確認真的寫入了
      const verify = await supabase.from("knowledge_nodes").select("id").eq("id", nodeId).single();
      if (verify.error || !verify.data) {
        throw new Error("寫入驗證失敗：" + (verify.error?.message || "查無此節點"));
      }
    }
    // 建立版本快照
    saveVersion(nodeId, d);
    // 清除本地草稿（已發布）
    localStorage.removeItem(draftKey());
    isDirty = false;
    setStatus("published", "已發布");
    renderVersionList();
    // 發布成功對話框：提供前往查看
    const doneOverlay = document.createElement("div");
    doneOverlay.className = "modal-overlay";
    doneOverlay.style.display = "flex";
    doneOverlay.style.alignItems = "center";
    doneOverlay.style.justifyContent = "center";
    const modalIsPublic = $("ed-public").checked;
    doneOverlay.innerHTML = `
      <div class="modal" style="max-width:420px;text-align:center;padding:40px 32px;border-radius:20px;background:linear-gradient(160deg,#1e2a4a 0%,#141d33 100%);border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 64px rgba(0,0,0,0.5);">
        <div style="width:72px;height:72px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#10b981 0%,#059669 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(16,185,129,0.35);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 10px;letter-spacing:0.5px;">發布成功</h3>
        <p style="font-size:14px;line-height:1.7;color:#9aa4c0;margin:0 0 28px;">你的知識節點已經${modalIsPublic ? "公開" : "私人"}發布${modalIsPublic ? "，其他人可以在知識庫看到它" : "，可在「我的節點」中找到它"}。</p>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="done-stay" style="padding:12px 24px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#cbd5e1;font-size:14px;font-weight:500;cursor:pointer;transition:all 0.2s;">繼續編輯</button>
          <button id="done-view" style="padding:12px 28px;border-radius:12px;border:none;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(245,158,11,0.3);transition:all 0.2s;">前往知識庫 →</button>
        </div>
      </div>`;
    document.body.appendChild(doneOverlay);
    doneOverlay.querySelector("#done-stay").onclick = () => doneOverlay.remove();
    doneOverlay.querySelector("#done-view").onclick = () => location.href = "knowledge.html?mode=mine";
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
  if (isDirty) {
    // 強制立即儲存，避免 debounce 期間關閉丟失
    try { localStorage.setItem(draftKey(), JSON.stringify(collectData())); } catch {}
  }
});

await loadInitial();

/* ===== AI 建庫小幫手 ===== */
let abTab = "socratic";
let abSocraticQA = [];

function openBuilder() {
  $("ai-builder-panel").style.display = "flex";
  renderBuilderTab();
}
$("btn-ai-builder").onclick = openBuilder;
$("ai-builder-close").onclick = () => $("ai-builder-panel").style.display = "none";
document.querySelectorAll(".ab-tab").forEach(t => {
  t.onclick = () => {
    document.querySelectorAll(".ab-tab").forEach(x => x.classList.remove("on"));
    t.classList.add("on");
    abTab = t.dataset.abtab;
    renderBuilderTab();
  };
});

function renderBuilderTab() {
  const c = $("ai-builder-content");
  if (abTab === "socratic") renderAbSocratic(c);
  else if (abTab === "feynman") renderAbFeynman(c);
  else if (abTab === "suggest") renderAbSuggest(c);
}

function getTopic() {
  const d = collectData();
  return d.title || d.question || "";
}

/* --- 蘇格拉底探索 --- */
async function renderAbSocratic(c) {
  const topic = getTopic();
  if (!topic) {
    c.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">先在上方輸入標題或主題，AI 才能為你設計探索問題。</p>`;
    return;
  }
  if (!abSocraticQA.length || abSocraticQA._topic !== topic) {
    c.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">蘇格拉底正在為「${esc(topic)}」準備問題…</p>`;
    try {
      const reply = await ask(
        `你是蘇格拉底式的導師。用繁體中文，為「${topic}」設計 3 個引導思考的問題。要求：不要出考試題（像「有什麼特點」「你了解多少」這種），要出情境代入題（用「如果你是…」「想像…」「你覺得為什麼…」開頭，讓人從某個角度去想，沒有標準答案）。由淺入深，每行一個，格式「Q1. 問題」。不超過 120 字。`,
        `主題：${topic}`,
        { model: MODELS.socratic }
      );
      abSocraticQA = reply.split("\n").map(l => l.replace(/^Q\d+[.、]\s*/, "").trim()).filter(Boolean).slice(0, 3).map(q => ({ q, a: "" }));
      abSocraticQA._topic = topic;
    } catch {
      abSocraticQA = [{ q: `你對「${topic}」最了解什麼？`, a: "" }];
      abSocraticQA._topic = topic;
    }
  }
  c.innerHTML = `
    <p style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">回答後可一鍵插入編輯器。想要深入對話？</p>
    <button class="btn btn-primary btn-sm" id="ab-socratic-chat" style="margin-bottom:12px;width:100%;">💬 開始 AI 蘇格拉底對話 →</button>
    ${abSocraticQA.map((qa, i) => `
      <div class="gc-q" style="margin-bottom:10px;">
        <div class="q-label">問題 ${i + 1}</div>
        <div class="q-text" style="font-size:14px;">${esc(qa.q)}</div>
        <textarea class="input" id="ab-a${i}" rows="2" placeholder="你的回答…" style="width:100%;margin-top:8px;">${esc(qa.a || "")}</textarea>
      </div>`).join("")}
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn btn-ghost btn-sm" id="ab-regen">換一組</button>
      <button class="btn btn-primary btn-sm" id="ab-insert-qa">插入問答 →</button>
    </div>`;
  $("ab-socratic-chat").onclick = () => {
    const t = getTopic();
    // 把對話結果存回來：對話頁會把主題存在 sessionStorage
    try { sessionStorage.setItem("socratic_topic", t); } catch {}
    window.open("socratic.html", "_blank");
  };
  $("ab-regen").onclick = () => { abSocraticQA = []; renderBuilderTab(); };
  $("ab-insert-qa").onclick = () => {
    abSocraticQA.forEach((qa, i) => qa.a = document.getElementById(`ab-a${i}`).value.trim());
    const answered = abSocraticQA.filter(qa => qa.a);
    if (!answered.length) { toast("先回答至少一個問題"); return; }
    const blocks = answered.flatMap(qa => [
      { type: "heading", data: { text: qa.q, level: 3 } },
      { type: "paragraph", data: { text: qa.a } },
    ]);
    insertBlocksToEditor(blocks);
    toast("已插入編輯器");
  };
}

/* --- 費曼精煉 --- */
function renderAbFeynman(c) {
  c.innerHTML = `
    <p style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">
      貼上你的解釋草稿，AI 幫你精煉成更簡單、更完整的版本，可一鍵插入。
    </p>
    <textarea class="input" id="ab-feynman-in" rows="6" placeholder="貼上你的解釋…" style="width:100%;margin-bottom:12px;"></textarea>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="btn btn-primary btn-sm" id="ab-refine">AI 精煉</button>
    </div>
    <div id="ab-feynman-out"></div>`;
  $("ab-refine").onclick = async () => {
    const text = document.getElementById("ab-feynman-in").value.trim();
    if (text.length < 10) { toast("先貼上你的解釋"); return; }
    const out = document.getElementById("ab-feynman-out");
    out.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">精煉中…</p>`;
    try {
      const topic = getTopic();
      const reply = await ask(
        `你是費曼學習法導師。用繁體中文，把學生的解釋改寫得更簡單、更完整、更有條理。保留學生的原意和語氣，補充缺失的關鍵細節。用段落呈現，不超過 300 字。`,
        `主題：${topic}\n\n學生的解釋：\n${text}`,
        { model: MODELS.chat }
      );
      out.innerHTML = `
        <div style="background:oklch(1 0 0/0.03);border-radius:10px;padding:12px;margin-bottom:12px;">
          <div style="font-size:14px;line-height:1.8;">${esc(reply)}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="ab-insert-refined">插入精煉版 →</button>`;
      document.getElementById("ab-insert-refined").onclick = () => {
        insertBlocksToEditor([{ type: "paragraph", data: { text: reply } }]);
        toast("已插入編輯器");
      };
    } catch (e) {
      out.innerHTML = `<p style="color:var(--signal-red);font-size:13px;">失敗：${esc(e.message)}</p>`;
    }
  };
}

/* --- 資料建議 --- */
async function renderAbSuggest(c) {
  const topic = getTopic();
  if (!topic) {
    c.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">先在上方輸入標題或主題。</p>`;
    return;
  }
  c.innerHTML = `<p style="font-size:13px;color:var(--paper-400);">AI 正在分析「${esc(topic)}」的資料方向…</p>`;
  try {
    const d = collectData();
    const text = (d.blocks || []).map(b => b.data?.text || "").join("\n").slice(0, 1000);
    const reply = await ask(
      `你是學習規劃師。用繁體中文，針對「${topic}」推薦 4 個值得查找的資料方向。每行格式：「圖示|標題|一句話說明」。要多元：理論、歷史、應用、實驗。不超過 180 字。`,
      `主題：${topic}\n\n目前內容：\n${text}`,
      { model: MODELS.chat }
    );
    const items = reply.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 4).map(line => {
      const p = line.split("|").map(s => s.trim());
      return { icon: p[0] || "📖", title: p[1] || line, desc: p[2] || "" };
    });
    c.innerHTML = `
      <p style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">勾選想加入的，插入為待辦清單。</p>
      ${items.map((s, i) => `
        <label class="suggest-item" style="cursor:pointer;">
          <input type="checkbox" id="ab-s${i}" checked style="margin-top:4px;">
          <span class="s-icon">${esc(s.icon)}</span>
          <span><span class="s-title" style="font-size:13px;">${esc(s.title)}</span>
          <span class="s-desc">${esc(s.desc)}</span></span>
        </label>`).join("")}
      <button class="btn btn-primary btn-sm" id="ab-insert-sug" style="margin-top:12px;">插入待辦清單 →</button>`;
    document.getElementById("ab-insert-sug").onclick = () => {
      const checked = items.filter((_, i) => document.getElementById(`ab-s${i}`).checked);
      if (!checked.length) { toast("至少選一個"); return; }
      insertBlocksToEditor([{
        type: "checklist",
        data: { items: checked.map(s => ({ text: `${s.icon} ${s.title}：${s.desc}`, checked: false })) }
      }]);
      toast("已插入編輯器");
    };
  } catch (e) {
    c.innerHTML = `<p style="color:var(--signal-red);font-size:13px;">失敗：${esc(e.message)}</p>`;
  }
}

/* 插入區塊到編輯器尾端 */
function insertBlocksToEditor(newBlocks) {
  if (typeof editor !== "undefined" && editor && editor.getBlocks) {
    const cur = editor.getBlocks();
    editor.setBlocks([...cur, ...newBlocks]);
  } else {
    toast("編輯器還沒準備好，稍後再試");
  }
}
