/* v4 區塊編輯器：Google Sites 風格的視覺化內容編輯 */
/* 支援的區塊類型：段落、標題、引言、圖片、YouTube、程式碼、分隔線、待辦、嵌入 */

export const BLOCK_TYPES = [
  { type: "paragraph", label: "段落文字", icon: "¶" },
  { type: "heading", label: "標題", icon: "H" },
  { type: "quote", label: "引言", icon: "❝" },
  { type: "image", label: "圖片", icon: "🖼" },
  { type: "youtube", label: "YouTube 影片", icon: "▶" },
  { type: "code", label: "程式碼", icon: "</>" },
  { type: "divider", label: "分隔線", icon: "―" },
  { type: "checklist", label: "待辦清單", icon: "☑" },
  { type: "embed", label: "嵌入網頁", icon: "🔗" },
];

let _uid = 0;
export function newBlock(type, data = {}) {
  const defaults = {
    paragraph: { text: "" },
    heading: { text: "", level: 2 },
    quote: { text: "", cite: "" },
    image: { url: "", caption: "" },
    youtube: { url: "", caption: "" },
    code: { code: "", lang: "" },
    divider: {},
    checklist: { items: [{ text: "", done: false }] },
    embed: { url: "", caption: "" },
  };
  return { id: "b" + (++_uid) + "_" + Date.now().toString(36), type, data: { ...(defaults[type] || {}), ...data } };
}

export function youtubeId(url) {
  const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* 將 blocks 渲染為 HTML（檢視用） */
export function renderBlocks(blocks, esc) {
  if (!Array.isArray(blocks) || !blocks.length) return "";
  return blocks.map(b => {
    const d = b.data || {};
    switch (b.type) {
      case "heading": {
        const lv = Math.min(3, Math.max(2, d.level || 2));
        return `<h${lv} class="blk-h">${esc(d.text || "")}</h${lv}>`;
      }
      case "quote":
        return `<blockquote class="blk-quote">${esc(d.text || "")}${d.cite ? `<cite>— ${esc(d.cite)}</cite>` : ""}</blockquote>`;
      case "image":
        return d.url ? `<figure class="blk-img"><img src="${esc(d.url)}" alt="${esc(d.caption || "")}" loading="lazy">${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>` : "";
      case "youtube": {
        const vid = youtubeId(d.url);
        return vid ? `<figure class="blk-yt"><div class="yt-wrap"><iframe src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>` : "";
      }
      case "code":
        return `<pre class="blk-code"><code>${esc(d.code || "")}</code></pre>`;
      case "divider":
        return `<hr class="blk-div">`;
      case "checklist": {
        const items = Array.isArray(d.items) ? d.items : [];
        return `<ul class="blk-check">${items.map(it => `<li class="${it.done ? "done" : ""}">${it.done ? "☑" : "☐"} ${esc(it.text || "")}</li>`).join("")}</ul>`;
      }
      case "embed":
        return d.url ? `<figure class="blk-embed"><div class="embed-wrap"><iframe src="${esc(d.url)}" loading="lazy" sandbox="allow-scripts allow-same-origin"></iframe></div>${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>` : "";
      case "paragraph":
      default:
        return d.text ? `<p class="blk-p">${esc(d.text).replace(/\n/g, "<br>")}</p>` : "";
    }
  }).join("");
}

/* 從 blocks 提取純文字摘要（存入 answer 欄位用） */
export function blocksText(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.map(b => {
    const d = b.data || {};
    switch (b.type) {
      case "paragraph": case "heading": case "quote": return d.text || "";
      case "code": return d.code || "";
      case "checklist": return (d.items || []).map(i => i.text).join(" ");
      case "image": case "youtube": case "embed": return d.caption || "";
      default: return "";
    }
  }).filter(Boolean).join("\n").slice(0, 500);
}

/* 建立編輯器實例，掛載到 container 元素 */
export function createEditor(container, esc, initialBlocks, opts = {}) {
  let blocks = Array.isArray(initialBlocks) && initialBlocks.length
    ? initialBlocks
    : [newBlock("paragraph")];

  const css = `
  .be-canvas { display:flex; flex-direction:column; gap:4px; }
  .be-block { position:relative; border:1px solid transparent; border-radius:10px; padding:8px 10px; transition:border-color .15s; }
  .be-block:hover { border-color: oklch(0.60 0.12 80 / 0.25); background: oklch(1 0 0 / 0.02); }
  .be-block .be-ctrl { position:absolute; top:6px; right:6px; display:none; gap:4px; }
  .be-block:hover .be-ctrl { display:flex; }
  .be-ctrl button { width:26px; height:26px; border-radius:6px; border:1px solid oklch(0.60 0.12 80 / 0.25); background: oklch(0.22 0.04 260); color: var(--paper-200); cursor:pointer; font-size:12px; line-height:1; }
  .be-ctrl button:hover { background: oklch(0.30 0.05 260); }
  .be-input, .be-textarea { width:100%; background:transparent; border:none; outline:none; color:var(--paper-100); font-size:14px; resize:vertical; }
  .be-textarea { min-height:60px; line-height:1.7; }
  .be-hint { font-size:11px; color:var(--paper-400); margin-bottom:4px; }
  .be-add { display:flex; align-items:center; gap:8px; margin:6px 0; opacity:0; transition:opacity .15s; }
  .be-add:hover, .be-canvas:hover .be-add { opacity:1; }
  .be-add-line { flex:1; height:1px; background: oklch(0.60 0.12 80 / 0.2); }
  .be-add-btn { width:28px; height:28px; border-radius:50%; border:1px dashed oklch(0.60 0.12 80 / 0.4); background:transparent; color:var(--brass-300); cursor:pointer; font-size:16px; line-height:1; }
  .be-add-btn:hover { background: oklch(0.74 0.14 80 / 0.12); }
  .be-menu { display:flex; flex-wrap:wrap; gap:6px; padding:10px; background: oklch(0.20 0.04 260); border:1px solid oklch(0.60 0.12 80 / 0.25); border-radius:10px; margin:4px 0; }
  .be-menu button { display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:8px; border:1px solid oklch(0.60 0.12 80 / 0.2); background:transparent; color:var(--paper-200); cursor:pointer; font-size:13px; }
  .be-menu button:hover { background: oklch(0.74 0.14 80 / 0.12); border-color: var(--brass-400); }
  .be-menu button .bi { font-size:15px; }
  .blk-h { font-family:var(--font-display); margin:12px 0 8px; }
  h2.blk-h { font-size:20px; } h3.blk-h { font-size:17px; }
  .blk-quote { border-left:3px solid var(--brass-400); padding:8px 16px; margin:12px 0; color:var(--paper-200); font-style:italic; }
  .blk-quote cite { display:block; margin-top:6px; font-size:12px; color:var(--paper-400); font-style:normal; }
  .blk-img img { max-width:100%; border-radius:10px; }
  .blk-img figcaption, .blk-yt figcaption, .blk-embed figcaption { font-size:12px; color:var(--paper-400); margin-top:6px; text-align:center; }
  .yt-wrap, .embed-wrap { position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:10px; }
  .yt-wrap iframe, .embed-wrap iframe { position:absolute; inset:0; width:100%; height:100%; border:none; }
  .blk-code { background: oklch(0.16 0.03 260); border-radius:10px; padding:14px; overflow-x:auto; font-family:var(--font-mono); font-size:13px; }
  .blk-div { border:none; border-top:1px solid oklch(0.60 0.12 80 / 0.25); margin:16px 0; }
  .blk-check { list-style:none; padding:0; } .blk-check li { padding:4px 0; } .blk-check li.done { color:var(--paper-400); text-decoration:line-through; }
  .blk-p { line-height:1.8; margin:8px 0; }
  `;
  if (!document.getElementById("be-css")) {
    const st = document.createElement("style");
    st.id = "be-css"; st.textContent = css;
    document.head.appendChild(st);
  }

  function blockEditorHTML(b) {
    const d = b.data || {};
    const ctrl = `<div class="be-ctrl">
      <button data-act="up" title="上移">↑</button>
      <button data-act="down" title="下移">↓</button>
      <button data-act="del" title="刪除">✕</button>
    </div>`;
    let inner = "";
    switch (b.type) {
      case "paragraph":
        inner = `<div class="be-hint">段落</div><textarea class="be-textarea" data-k="text" placeholder="寫點什麼…">${esc(d.text || "")}</textarea>`;
        break;
      case "heading":
        inner = `<div class="be-hint">標題</div><input class="be-input" data-k="text" style="font-size:18px;font-weight:700;" placeholder="標題文字" value="${esc(d.text || "")}">`;
        break;
      case "quote":
        inner = `<div class="be-hint">引言</div><textarea class="be-textarea" data-k="text" placeholder="引言內容…">${esc(d.text || "")}</textarea><input class="be-input" data-k="cite" placeholder="出處（選填）" value="${esc(d.cite || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      case "image":
        inner = `<div class="be-hint">圖片</div><input class="be-input" data-k="url" placeholder="圖片網址（https://…）" value="${esc(d.url || "")}">${d.url ? `<img src="${esc(d.url)}" style="max-width:100%;border-radius:8px;margin-top:8px;" onerror="this.style.display='none'">` : ""}<input class="be-input" data-k="caption" placeholder="圖片說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      case "youtube":
        inner = `<div class="be-hint">YouTube 影片</div><input class="be-input" data-k="url" placeholder="YouTube 連結" value="${esc(d.url || "")}">${youtubeId(d.url) ? `<div style="margin-top:8px;color:var(--brass-300);font-size:12px;">✓ 影片已識別</div>` : ""}<input class="be-input" data-k="caption" placeholder="影片說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      case "code":
        inner = `<div class="be-hint">程式碼</div><textarea class="be-textarea" data-k="code" style="font-family:var(--font-mono);font-size:13px;" placeholder="貼上程式碼…">${esc(d.code || "")}</textarea>`;
        break;
      case "divider":
        inner = `<div class="be-hint">分隔線</div><hr style="border:none;border-top:1px solid oklch(0.60 0.12 80 / 0.25);">`;
        break;
      case "checklist": {
        const items = Array.isArray(d.items) ? d.items : [{ text: "", done: false }];
        inner = `<div class="be-hint">待辦清單</div>` + items.map((it, i) =>
          `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><input type="checkbox" data-ci="${i}" ${it.done ? "checked" : ""} style="width:16px;height:16px;"><input class="be-input" data-k="item" data-i="${i}" value="${esc(it.text || "")}" placeholder="待辦事項…"></div>`
        ).join("") + `<button class="btn btn-ghost btn-sm" data-act="add-item">＋ 新增項目</button>`;
        break;
      }
      case "embed":
        inner = `<div class="be-hint">嵌入網頁（iframe）</div><input class="be-input" data-k="url" placeholder="網址（https://…）" value="${esc(d.url || "")}"><input class="be-input" data-k="caption" placeholder="說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
    }
    return `<div class="be-block" data-bid="${b.id}">${ctrl}${inner}</div>`;
  }

  function render() {
    container.innerHTML = `<div class="be-canvas">` + blocks.map((b, i) => {
      const menuAnchor = `<div class="be-add" data-pos="${i}"><div class="be-add-line"></div><button class="be-add-btn" data-add="${i}">＋</button><div class="be-add-line"></div></div>`;
      return menuAnchor + blockEditorHTML(b);
    }).join("") + `<div class="be-add" data-pos="${blocks.length}"><div class="be-add-line"></div><button class="be-add-btn" data-add="${blocks.length}">＋</button><div class="be-add-line"></div></div></div><div class="be-menu-slot"></div>`;
    bind();
  }

  function syncFromDOM() {
    container.querySelectorAll(".be-block").forEach(el => {
      const b = blocks.find(x => x.id === el.dataset.bid);
      if (!b) return;
      el.querySelectorAll("[data-k]").forEach(inp => {
        const k = inp.dataset.k;
        if (k === "item") {
          const idx = +inp.dataset.i;
          b.data.items[idx].text = inp.value;
        } else {
          b.data[k] = inp.value;
        }
      });
      el.querySelectorAll("[data-ci]").forEach(cb => {
        b.data.items[+cb.dataset.ci].done = cb.checked;
      });
    });
  }

  function showMenu(pos) {
    syncFromDOM();
    const slot = container.querySelector(".be-menu-slot");
    slot.innerHTML = `<div class="be-menu">${BLOCK_TYPES.map(t =>
      `<button data-btype="${t.type}"><span class="bi">${t.icon}</span>${t.label}</button>`
    ).join("")}</div>`;
    slot.querySelectorAll("[data-btype]").forEach(btn => {
      btn.onclick = () => {
        blocks.splice(pos, 0, newBlock(btn.dataset.btype));
        render();
      };
    });
  }

  function bind() {
    container.querySelectorAll("[data-add]").forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); showMenu(+btn.dataset.add); };
    });
    container.querySelectorAll(".be-block").forEach(el => {
      const bid = el.dataset.bid;
      el.querySelector("[data-act='del']").onclick = () => {
        syncFromDOM();
        blocks = blocks.filter(x => x.id !== bid);
        if (!blocks.length) blocks = [newBlock("paragraph")];
        render();
      };
      el.querySelector("[data-act='up']").onclick = () => {
        syncFromDOM();
        const i = blocks.findIndex(x => x.id === bid);
        if (i > 0) { [blocks[i-1], blocks[i]] = [blocks[i], blocks[i-1]]; render(); }
      };
      el.querySelector("[data-act='down']").onclick = () => {
        syncFromDOM();
        const i = blocks.findIndex(x => x.id === bid);
        if (i < blocks.length - 1) { [blocks[i+1], blocks[i]] = [blocks[i], blocks[i+1]]; render(); }
      };
      const addItem = el.querySelector("[data-act='add-item']");
      if (addItem) addItem.onclick = () => {
        syncFromDOM();
        blocks.find(x => x.id === bid).data.items.push({ text: "", done: false });
        render();
      };
    });
  }

  render();

  const _notify = () => { if (opts.onChange) { try { syncFromDOM(); opts.onChange(blocks); } catch {} } };
  const _origRender = render;
  render = () => { _origRender(); _notify(); };
  return {
    getBlocks() { syncFromDOM(); return blocks; },
    setBlocks(nb) { blocks = nb && nb.length ? nb : [newBlock("paragraph")]; render(); },
  };
}
