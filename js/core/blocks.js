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
    feynman: { concept: "", explanation: "", audience: "小學生" },
  };
  return { id: "b" + (++_uid) + "_" + Date.now().toString(36), type, data: { ...(defaults[type] || {}), ...data } };
}


/* 文字樣式控制（字體大小/顏色/背景） */
function styleControls(d) {
  const fs = d.fontSize || "";
  const fc = d.color || "";
  const bg = d.bg || "";
  return `<div class="be-style-row" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">
    <select data-k="fontSize" class="be-select" style="font-size:12px;padding:4px 6px;border-radius:6px;background:oklch(1 0 0 / 0.05);border:1px solid oklch(1 0 0 / 0.12);color:var(--paper-200);">
      <option value="">預設大小</option>
      <option value="12px" ${fs==="12px"?"selected":""}>小</option>
      <option value="14px" ${fs==="14px"?"selected":""}>中</option>
      <option value="18px" ${fs==="18px"?"selected":""}>大</option>
      <option value="24px" ${fs==="24px"?"selected":""}>特大</option>
    </select>
    <input type="color" data-k="color" value="${fc||"#e8e4d8"}" title="文字顏色" style="width:28px;height:28px;border:none;border-radius:6px;cursor:pointer;background:none;padding:0;">
    <input type="color" data-k="bg" value="${bg||"#000000"}" title="背景色（選黑=透明）" style="width:28px;height:28px;border:none;border-radius:6px;cursor:pointer;background:none;padding:0;">
    ${bg && bg.toLowerCase() !== "#000000" ? `<button data-act="clearbg" title="清除背景" style="font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid oklch(1 0 0 / 0.15);background:none;color:var(--paper-400);cursor:pointer;">清除背景</button>` : ""}
  </div>`;
}
function textStyle(d) {
  let s = "";
  if (d.fontSize) s += `font-size:${d.fontSize};`;
  if (d.color) s += `color:${d.color};`;
  if (d.bg && d.bg.toLowerCase() !== "#000000") s += `background:${d.bg};padding:4px 8px;border-radius:6px;`;
  return s;
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
        return `<h${lv} class="blk-h" style="${textStyle(d)}">${esc(d.text || "")}</h${lv}>`;
      }
      case "quote":
        return `<blockquote class="blk-quote" style="${textStyle(d)}">${esc(d.text || "")}${d.cite ? `<cite>— ${esc(d.cite)}</cite>` : ""}</blockquote>`;
      case "image":
        return d.url ? `<figure class="blk-img"><img src="${esc(d.url)}" alt="${esc(d.caption || "")}" loading="lazy">${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>` : "";
      case "youtube": {
        const vid = youtubeId(d.url);
        if (!vid) return "";
        return `<figure class="blk-yt"><div class="yt-wrap"><iframe src="https://www.youtube.com/embed/${vid}?rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
          + `${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}`
          + `<div style="text-align:center;margin-top:6px;"><a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener" style="font-size:12px;color:var(--brass-300);">在 YouTube 上觀看 ↗</a></div></figure>`;
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
      case "feynman": return [d.concept, d.explanation].filter(Boolean).join("\n");
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
        inner = `<div class="be-hint">段落</div><textarea class="be-textarea" data-k="text" placeholder="寫點什麼…" style="${textStyle(d)}">${esc(d.text || "")}</textarea>` + styleControls(d);
        break;
      case "heading":
        inner = `<div class="be-hint">標題</div><input class="be-input" data-k="text" style="font-size:18px;font-weight:700;${textStyle(d)}" placeholder="標題文字" value="${esc(d.text || "")}">` + styleControls(d);
        break;
      case "quote":
        inner = `<div class="be-hint">引言</div><textarea class="be-textarea" data-k="text" placeholder="引言內容…" style="${textStyle(d)}">${esc(d.text || "")}</textarea>` + styleControls(d) + `<input class="be-input" data-k="cite" placeholder="出處（選填）" value="${esc(d.cite || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      case "image":
        inner = `<div class="be-hint">圖片</div><input class="be-input" data-k="url" placeholder="圖片網址（https://…）" value="${esc(d.url || "")}">${d.url ? `<img src="${esc(d.url)}" style="max-width:100%;border-radius:8px;margin-top:8px;" onerror="this.style.display='none'">` : ""}<input class="be-input" data-k="caption" placeholder="圖片說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      case "youtube": {
        const _vid = youtubeId(d.url);
        inner = `<div class="be-hint">YouTube 影片</div><input class="be-input" data-k="url" placeholder="貼上 YouTube 連結（watch / shorts / youtu.be 皆可）" value="${esc(d.url || "")}">`
          + (_vid
            ? `<div style="margin-top:8px;"><div style="color:var(--brass-300);font-size:12px;margin-bottom:6px;">✓ 影片已識別 — 即時預覽</div><div class="yt-wrap" style="max-width:480px;"><iframe src="https://www.youtube.com/embed/${_vid}?rel=0" frameborder="0" allowfullscreen loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:none;border-radius:10px;"></iframe></div></div>`
            : (d.url ? `<div style="margin-top:8px;color:var(--signal-red);font-size:12px;">⚠ 無法識別影片連結，請檢查網址</div>` : ""))
          + `<input class="be-input" data-k="caption" placeholder="影片說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      }
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
      case "feynman":
        inner = `<div class="be-hint">費曼解釋 — 用最簡單的話講清楚一個概念</div>
          <input class="be-input" data-k="concept" placeholder="要解釋的概念（例：光合作用）" value="${esc(d.concept || "")}">
          <input class="be-input" data-k="audience" placeholder="解釋對象（預設：小學生）" value="${esc(d.audience || "小學生")}" style="margin-top:6px;font-size:12px;">
          <textarea class="be-textarea" data-k="explanation" placeholder="用你自己的話解釋…想像對方完全不懂，從零講起" style="margin-top:6px;min-height:100px;">${esc(d.explanation || "")}</textarea>
          <div style="font-size:11px;color:var(--paper-400);margin-top:4px;">💡 費曼技巧：教別人的過程就是最好的學習。寫完後可到「費曼說服」讓 AI 驗證你的理解。</div>`;
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
      /* YouTube URL 即時預覽 */
      const ytInput = el.querySelector('input[data-k="url"]');
      if (ytInput && el.querySelector(".be-hint")?.textContent?.includes("YouTube")) {
        let _t = null;
        ytInput.addEventListener("input", () => {
          clearTimeout(_t);
          _t = setTimeout(() => { syncFromDOM(); render(); }, 800);
        });
      }
      /* 清除背景色 */
      const clearBg = el.querySelector("[data-act='clearbg']");
      if (clearBg) clearBg.onclick = e => {
        e.stopPropagation();
        syncFromDOM();
        const b = blocks.find(x => x.id === bid);
        if (b) { b.data.bg = "#000000"; render(); }
      };
      /* 樣式變更即時預覽 */
      el.querySelectorAll('select[data-k], input[type="color"][data-k]').forEach(inp => {
        inp.addEventListener("change", () => { syncFromDOM(); render(); });
      });
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
