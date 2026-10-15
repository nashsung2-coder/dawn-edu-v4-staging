/* v4 區塊編輯器：Google Sites 風格的視覺化內容編輯 */
/* 支援的區塊類型：段落、標題、引言、圖片、YouTube、程式碼、分隔線、待辦、嵌入 */

export const BLOCK_TYPES = [
  { type: "paragraph", label: "段落文字", icon: "¶", desc: "一般的文字段落" },
  { type: "heading", label: "標題", icon: "H", desc: "大標題、小標題" },
  { type: "quote", label: "引言", icon: "❝", desc: "引用名言或重點" },
  { type: "image", label: "圖片", icon: "🖼", desc: "上傳或貼上圖片連結" },
  { type: "youtube", label: "YouTube 影片", icon: "▶", desc: "嵌入 YouTube 影片" },
  { type: "code", label: "程式碼", icon: "</>", desc: "可執行的程式碼" },
  { type: "divider", label: "分隔線", icon: "―", desc: "分隔不同段落" },
  { type: "checklist", label: "待辦清單", icon: "☑", desc: "可勾選的清單" },
  { type: "embed", label: "嵌入網頁", icon: "🔗", desc: "嵌入外部網頁" },
  { type: "gdrive", label: "Google 雲端", icon: "☁", desc: "Drive/文件/試算表" },
  { type: "feynman", label: "費曼解釋", icon: "💡", desc: "用簡單的話講清楚概念" },
  { type: "battle", label: "知識對戰", icon: "⚔", desc: "AI 出題驗證理解" },
];

let _uid = 0;
export function newBlock(type, data = {}) {
  const defaults = {
    paragraph: { text: "" },
    heading: { text: "", level: 2 },
    quote: { text: "", cite: "" },
    image: { url: "", caption: "" },
    gdrive: { url: "", caption: "" },
    youtube: { url: "", caption: "" },
    code: { code: "", lang: "" },
    divider: {},
    checklist: { items: [{ text: "", done: false }] },
    embed: { url: "", caption: "" },
    feynman: { concept: "", explanation: "", audience: "小學生" },
    battle: { topic: "", description: "", difficulty: "adaptive" },
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
      case "gdrive": {
        const gUrl2 = d.url || "";
        let eUrl2 = "";
        const df2 = gUrl2.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        const dd2 = gUrl2.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
        const ds2 = gUrl2.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        const dp2 = gUrl2.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
        if (df2) eUrl2 = `https://drive.google.com/file/d/${df2[1]}/preview`;
        else if (dd2) eUrl2 = `https://docs.google.com/document/d/${dd2[1]}/preview`;
        else if (ds2) eUrl2 = `https://docs.google.com/spreadsheets/d/${ds2[1]}/preview`;
        else if (dp2) eUrl2 = `https://docs.google.com/presentation/d/${dp2[1]}/embed`;
        return eUrl2 ? `<figure class="blk-embed"><iframe src="${eUrl2}" style="width:100%;height:480px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:#fff;" loading="lazy"></iframe>${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>` : "";
      }
      case "image":
        return d.url ? `<figure class="blk-img"><img src="${esc(d.url)}" alt="${esc(d.caption || "")}" loading="lazy">${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>` : "";
      case "youtube": {
        const vid = youtubeId(d.url);
        if (!vid) return "";
        return `<figure class="blk-yt"><div class="yt-wrap"><iframe src="https://www.youtube.com/embed/${vid}?rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
          + `${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}`
          + `<div style="text-align:center;margin-top:6px;"><a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener" style="font-size:12px;color:var(--brass-300);">在 YouTube 上觀看 ↗</a></div></figure>`;
      }
      case "code": {
        const _langLabel = { html: "HTML", css: "CSS", javascript: "JavaScript", python: "Python", text: "純文字", auto: "" }[d.lang] || "";
        return `<div class="blk-code-wrap" style="margin:12px 0;">${_langLabel ? `<div style="font-size:11px;color:var(--paper-400);margin-bottom:4px;">${_langLabel}</div>` : ""}<pre class="blk-code"><code>${esc(d.code || "")}</code></pre></div>`;
      }
      case "divider":
        return `<hr class="blk-div">`;
      case "checklist": {
        const items = Array.isArray(d.items) ? d.items : [];
        return `<ul class="blk-check">${items.map(it => `<li class="${it.done ? "done" : ""}">${it.done ? "☑" : "☐"} ${esc(it.text || "")}</li>`).join("")}</ul>`;
      }
      case "gdrive": {
        const gUrl = d.url || "";
        let embedUrl = "";
        let fileType = "";
        // 解析各種 Google 連結
        const driveFile = gUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        const docsDoc = gUrl.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
        const sheetsDoc = gUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        const slidesDoc = gUrl.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
        if (driveFile) { embedUrl = `https://drive.google.com/file/d/${driveFile[1]}/preview`; fileType = "雲端檔案"; }
        else if (docsDoc) { embedUrl = `https://docs.google.com/document/d/${docsDoc[1]}/preview`; fileType = "Google 文件"; }
        else if (sheetsDoc) { embedUrl = `https://docs.google.com/spreadsheets/d/${sheetsDoc[1]}/preview`; fileType = "Google 試算表"; }
        else if (slidesDoc) { embedUrl = `https://docs.google.com/presentation/d/${slidesDoc[1]}/embed`; fileType = "Google 簡報"; }
        inner = `<div class="be-hint">Google 雲端 ${fileType ? `· ${fileType}` : ""}</div>
          <input class="be-input" data-k="url" placeholder="貼上 Google Drive / 文件 / 試算表 / 簡報的分享連結" value="${esc(gUrl)}">
          ${embedUrl ? `<div style="margin-top:8px;"><div style="color:var(--brass-300);font-size:12px;margin-bottom:6px;">✓ 已識別為${fileType} — 即時預覽</div><iframe src="${embedUrl}" style="width:100%;height:400px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:#fff;"></iframe></div>`
            : (gUrl ? `<div style="margin-top:8px;color:var(--signal-red);font-size:12px;">⚠ 無法識別連結，請確認是 Google 分享連結</div>` : "")}
          <input class="be-input" data-k="caption" placeholder="說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
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
      case "battle": {
        if (!d.topic) return "";
        const diffLabel = { adaptive: "自適應難度", easy: "簡單", normal: "普通", hard: "困難" }[d.difficulty] || "自適應難度";
        return `<div class="blk-battle" style="border:1px solid oklch(0.6 0.2 250 / 0.3);border-radius:12px;padding:16px;margin:12px 0;background:oklch(0.6 0.2 250 / 0.05);text-align:center;">
          <div style="font-size:12px;font-weight:700;color:var(--brass-300);margin-bottom:8px;">⚔ 知識對戰 · ${diffLabel}</div>
          <div style="font-size:15px;font-weight:700;margin-bottom:8px;">${esc(d.topic)}</div>
          ${d.description ? `<div style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">${esc(d.description)}</div>` : ""}
          <button class="btn btn-primary btn-sm" onclick="location.href='quiz.html?topic='+encodeURIComponent('${esc(d.topic)}'.replace(/'/g, ""))">開始對戰</button>
        </div>`;
      }
      case "feynman": return [d.concept, d.explanation].filter(Boolean).join("\n");
      case "battle": return [d.topic, d.description].filter(Boolean).join("\n");
      default: return "";
    }
  }).filter(Boolean).join("\n").slice(0, 500);
}

/* 建立編輯器實例，掛載到 container 元素 */
export function createEditor(container, esc, initialBlocks, opts = {}) {
  let blocks = Array.isArray(initialBlocks) && initialBlocks.length
    ? initialBlocks
    : [newBlock("paragraph")];
  /* 快捷鍵：歷史記錄（結構性撤銷/重做） */
  let _history = [];
  let _hIndex = -1;
  const _snap = () => JSON.stringify(blocks);
  function _pushHistory() {
    _history = _history.slice(0, _hIndex + 1);
    _history.push(_snap());
    if (_history.length > 50) _history.shift();
    _hIndex = _history.length - 1;
  }
  function _restore(json) {
    try {
      blocks = JSON.parse(json);
      render();
      _notify();
    } catch {}
  }
  function undo() {
    if (_hIndex > 0) { _hIndex--; _restore(_history[_hIndex]); return true; }
    return false;
  }
  function redo() {
    if (_hIndex < _history.length - 1) { _hIndex++; _restore(_history[_hIndex]); return true; }
    return false;
  }
  _pushHistory(); // 初始狀態

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
  .be-add { display:flex; align-items:center; gap:8px; margin:10px 0; opacity:0.45; transition:opacity .2s; }
  .be-add:hover { opacity:1; }
  .be-add:hover .be-add-line { background: oklch(0.74 0.14 80 / 0.5); }
  .be-add-line { flex:1; height:1px; background: oklch(0.60 0.12 80 / 0.2); }
  .be-add-btn { width:28px; height:28px; border-radius:50%; border:1px dashed oklch(0.60 0.12 80 / 0.4); background:transparent; color:var(--brass-300); cursor:pointer; font-size:16px; line-height:1; }
  .be-add-btn:hover { background: oklch(0.74 0.14 80 / 0.12); }
  .be-add-end { opacity:1 !important; margin:16px 0 8px; }
  .be-add-end .be-add-btn { width:auto; padding:8px 20px; border-radius:20px; }
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
      case "image": {
        const imgUrl = d.url || "";
        // Google Drive 連結轉換為可嵌入格式
        let displayUrl = imgUrl;
        const driveMatch = imgUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) displayUrl = `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
        inner = `<div class="be-hint">圖片</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input class="be-input" data-k="url" placeholder="圖片網址、Google Drive 連結，或直接 Ctrl+V 貼上圖片" value="${esc(imgUrl)}" style="flex:1;">
            <label class="btn btn-ghost btn-sm" style="cursor:pointer;white-space:nowrap;">
              上傳圖片
              <input type="file" accept="image/*" data-img-upload style="display:none;">
            </label>
          </div>
          ${displayUrl ? `<img src="${esc(displayUrl)}" style="max-width:100%;border-radius:8px;" onerror="this.style.display='none'">` : `<div style="padding:20px;text-align:center;color:var(--paper-400);font-size:12px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;">貼上圖片網址、Google Drive 連結，或點擊「上傳圖片」</div>`}
          <input class="be-input" data-k="caption" placeholder="圖片說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      }
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
      case "code": {
        const _code = d.code || "";
        const _lang = d.lang || "auto";
        // 簡單的語法高亮預覽（轉義後加上顏色）
        const _highlighted = esc(_code)
          .replace(/(&quot;.*?&quot;|&#39;.*?&#39;|"[^"]*"|'[^']*')/g, '<span style="color:#f0d080;">$1</span>')
          .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|class|new)\b/g, '<span style="color:#80c0ff;">$1</span>')
          .replace(/(\/\/.*$)/gm, '<span style="color:#808080;">$1</span>');
        const _isHtml = _lang === "html" || (_lang === "auto" && /<(!DOCTYPE|html|head|body|div|p|h1|style|script)/i.test(_code));
        inner = `<div class="be-hint">程式碼</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap;">
            <select data-k="lang" class="be-select" style="font-size:12px;padding:4px 8px;border-radius:6px;background:oklch(1 0 0 / 0.05);border:1px solid oklch(1 0 0 / 0.12);color:var(--paper-200);">
              <option value="auto" ${_lang==="auto"?"selected":""}>自動偵測</option>
              <option value="html" ${_lang==="html"?"selected":""}>HTML</option>
              <option value="css" ${_lang==="css"?"selected":""}>CSS</option>
              <option value="javascript" ${_lang==="javascript"?"selected":""}>JavaScript</option>
              <option value="python" ${_lang==="python"?"selected":""}>Python</option>
              <option value="text" ${_lang==="text"?"selected":""}>純文字</option>
            </select>
            ${_code && ["html","python","javascript"].includes(_lang) ? `<button class="btn btn-ghost btn-sm" data-act="run-preview" style="font-size:12px;">▶ 執行</button>` : ""}
          </div>
          <textarea class="be-textarea" data-k="code" data-code-input style="font-family:var(--font-mono);font-size:13px;" placeholder="貼上程式碼…">${esc(_code)}</textarea>
          ${_code ? `<div style="margin-top:8px;"><div style="font-size:11px;color:var(--paper-400);margin-bottom:4px;">語法預覽</div><pre style="background:oklch(0 0 0 / 0.3);border-radius:8px;padding:12px;font-family:var(--font-mono);font-size:13px;overflow-x:auto;margin:0;max-height:300px;overflow-y:auto;"><code>${_highlighted}</code></pre></div>` : ""}
          <div data-run-output style="margin-top:8px;display:none;">
            <div style="font-size:11px;color:var(--paper-400);margin-bottom:4px;">執行結果</div>
            <pre data-run-text style="display:none;background:#0a0a0a;color:#e0e0e0;border-radius:8px;padding:12px;font-family:var(--font-mono);font-size:13px;white-space:pre-wrap;max-height:300px;overflow-y:auto;margin:0;"></pre>
            <iframe data-run-frame sandbox="allow-scripts" style="display:none;width:100%;min-height:320px;border:1px solid oklch(1 0 0 / 0.12);border-radius:8px;background:white;"></iframe>
          </div>`;
        break;
      }
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
      case "battle":
        inner = `<div class="be-hint">知識對戰 — 在節點中嵌入一場對戰挑戰</div>
          <input class="be-input" data-k="topic" placeholder="對戰主題（例：光合作用）" value="${esc(d.topic || "")}">
          <textarea class="be-textarea" data-k="description" placeholder="挑戰說明（選填，例：測試你對光合作用的理解）" style="margin-top:6px;min-height:60px;">${esc(d.description || "")}</textarea>
          <select data-k="difficulty" class="be-select" style="margin-top:6px;font-size:12px;padding:6px 8px;border-radius:6px;background:oklch(1 0 0 / 0.05);border:1px solid oklch(1 0 0 / 0.12);color:var(--paper-200);width:100%;">
            <option value="adaptive" ${(d.difficulty||"adaptive")==="adaptive"?"selected":""}>自適應難度（推薦）</option>
            <option value="easy" ${d.difficulty==="easy"?"selected":""}>固定：簡單</option>
            <option value="normal" ${d.difficulty==="normal"?"selected":""}>固定：普通</option>
            <option value="hard" ${d.difficulty==="hard"?"selected":""}>固定：困難</option>
          </select>
          <div style="font-size:11px;color:var(--paper-400);margin-top:4px;">讀者點擊「開始對戰」會跳轉到對戰頁面，以此主題進行 AI 出題挑戰。</div>`;
        break;
      case "gdrive": {
        const gUrl = d.url || "";
        let embedUrl = "";
        let fileType = "";
        // 解析各種 Google 連結
        const driveFile = gUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        const docsDoc = gUrl.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
        const sheetsDoc = gUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        const slidesDoc = gUrl.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
        if (driveFile) { embedUrl = `https://drive.google.com/file/d/${driveFile[1]}/preview`; fileType = "雲端檔案"; }
        else if (docsDoc) { embedUrl = `https://docs.google.com/document/d/${docsDoc[1]}/preview`; fileType = "Google 文件"; }
        else if (sheetsDoc) { embedUrl = `https://docs.google.com/spreadsheets/d/${sheetsDoc[1]}/preview`; fileType = "Google 試算表"; }
        else if (slidesDoc) { embedUrl = `https://docs.google.com/presentation/d/${slidesDoc[1]}/embed`; fileType = "Google 簡報"; }
        inner = `<div class="be-hint">Google 雲端 ${fileType ? `· ${fileType}` : ""}</div>
          <input class="be-input" data-k="url" placeholder="貼上 Google Drive / 文件 / 試算表 / 簡報的分享連結" value="${esc(gUrl)}">
          ${embedUrl ? `<div style="margin-top:8px;"><div style="color:var(--brass-300);font-size:12px;margin-bottom:6px;">✓ 已識別為${fileType} — 即時預覽</div><iframe src="${embedUrl}" style="width:100%;height:400px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:#fff;"></iframe></div>`
            : (gUrl ? `<div style="margin-top:8px;color:var(--signal-red);font-size:12px;">⚠ 無法識別連結，請確認是 Google 分享連結</div>` : "")}
          <input class="be-input" data-k="caption" placeholder="說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      }
      case "embed":
        inner = `<div class="be-hint">嵌入網頁（iframe）</div><input class="be-input" data-k="url" placeholder="網址（https://…）" value="${esc(d.url || "")}"><input class="be-input" data-k="caption" placeholder="說明（選填）" value="${esc(d.caption || "")}" style="margin-top:6px;font-size:12px;">`;
        break;
      case "battle": {
        if (!d.topic) return "";
        const diffLabel = { adaptive: "自適應難度", easy: "簡單", normal: "普通", hard: "困難" }[d.difficulty] || "自適應難度";
        return `<div class="blk-battle" style="border:1px solid oklch(0.6 0.2 250 / 0.3);border-radius:12px;padding:16px;margin:12px 0;background:oklch(0.6 0.2 250 / 0.05);text-align:center;">
          <div style="font-size:12px;font-weight:700;color:var(--brass-300);margin-bottom:8px;">⚔ 知識對戰 · ${diffLabel}</div>
          <div style="font-size:15px;font-weight:700;margin-bottom:8px;">${esc(d.topic)}</div>
          ${d.description ? `<div style="font-size:13px;color:var(--paper-400);margin-bottom:12px;">${esc(d.description)}</div>` : ""}
          <button class="btn btn-primary btn-sm" onclick="location.href='quiz.html?topic='+encodeURIComponent('${esc(d.topic)}'.replace(/'/g, ""))">開始對戰</button>
        </div>`;
      }
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
    }).join("") + `<div class="be-add be-add-end" data-pos="${blocks.length}"><div class="be-add-line"></div><button class="be-add-btn" data-add="${blocks.length}">＋ 加入區塊</button><div class="be-add-line"></div></div></div><div class="be-menu-slot"></div>`;
    bind();
  }

  function syncFromDOM() {
    // 圖片上傳：轉為 base64 存入
    container.querySelectorAll("[data-img-upload]").forEach(input => {
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert("圖片太大，請選擇 2MB 以內的圖片"); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const el = input.closest(".be-block");
          const urlInput = el.querySelector('[data-k="url"]');
          if (urlInput) {
            urlInput.value = reader.result;
            urlInput.dispatchEvent(new Event("input", { bubbles: true }));
            syncFromDOM();
            render();
          }
        };
        reader.readAsDataURL(file);
      };
    });
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
    // 用 DOM 順序重新計算正確的插入位置（避免索引錯亂）
    const blockEls = [...container.querySelectorAll(".be-block")];
    const addBtns = [...container.querySelectorAll("[data-add]")];
    const btnIndex = addBtns.findIndex(b => +b.dataset.add === pos);
    // 插入位置 = 該按鈕在 DOM 中的順序
    const safePos = btnIndex >= 0 ? btnIndex : pos;
    const slot = container.querySelector(".be-menu-slot");
    slot.innerHTML = `<div class="be-menu" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;padding:16px;background:oklch(0.20 0.04 260);border:1px solid oklch(0.60 0.12 80 / 0.25);border-radius:12px;margin:8px 0;">${BLOCK_TYPES.map(t =>
      `<button data-btype="${t.type}" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;border:1px solid oklch(0.60 0.12 80 / 0.15);background:transparent;color:var(--paper-200);cursor:pointer;text-align:left;transition:all .15s;" onmouseover="this.style.background='oklch(0.74 0.14 80 / 0.1)';this.style.borderColor='var(--brass-400)'" onmouseout="this.style.background='transparent';this.style.borderColor='oklch(0.60 0.12 80 / 0.15)'">
        <span style="font-size:22px;line-height:1;">${t.icon}</span>
        <span><span style="display:block;font-size:13px;font-weight:600;">${t.label}</span><span style="display:block;font-size:11px;color:var(--paper-400);margin-top:2px;">${t.desc || ""}</span></span>
      </button>`
    ).join("")}</div>`;
    slot.querySelectorAll("[data-btype]").forEach(btn => {
      btn.onclick = () => {
        syncFromDOM();
        _pushHistory();
        const insertAt = Math.min(safePos, blocks.length);
        blocks.splice(insertAt, 0, newBlock(btn.dataset.btype));
        render();
        // 滾動到新插入的區塊
        setTimeout(() => {
          const newEl = container.querySelectorAll(".be-block")[insertAt];
          if (newEl) newEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      };
    });
  }

  function bind() {
    // 貼上圖片：Ctrl+V 直接在編輯器任何位置貼上圖片
    if (!container._pasteBound) {
      container._pasteBound = true;
      container.addEventListener("paste", e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert("圖片太大，請貼上 2MB 以內的圖片"); return; }
            const reader = new FileReader();
            reader.onload = () => {
              syncFromDOM();
              _pushHistory();
              // 貼在最後一個區塊後面，或焦點所在的區塊後面
              const focused = document.activeElement?.closest?.(".be-block");
              let insertAt = blocks.length;
              if (focused) {
                const idx = [...container.querySelectorAll(".be-block")].indexOf(focused);
                if (idx >= 0) insertAt = idx + 1;
              }
              blocks.splice(insertAt, 0, newBlock("image", { url: reader.result }));
              render();
              setTimeout(() => {
                const newEl = container.querySelectorAll(".be-block")[insertAt];
                if (newEl) newEl.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 100);
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      });
    }
    container.querySelectorAll("[data-add]").forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); showMenu(+btn.dataset.add); };
    });

    // 圖片上傳：轉為 base64 存入
    container.querySelectorAll("[data-img-upload]").forEach(input => {
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert("圖片太大，請選擇 2MB 以內的圖片"); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const el = input.closest(".be-block");
          const urlInput = el.querySelector('[data-k="url"]');
          if (urlInput) {
            urlInput.value = reader.result;
            urlInput.dispatchEvent(new Event("input", { bubbles: true }));
            syncFromDOM();
            render();
          }
        };
        reader.readAsDataURL(file);
      };
    });
    container.querySelectorAll(".be-block").forEach(el => {
      const bid = el.dataset.bid;
      el.querySelector("[data-act='del']").onclick = () => {
        syncFromDOM();
        _pushHistory();
        blocks = blocks.filter(x => x.id !== bid);
        if (!blocks.length) blocks = [newBlock("paragraph")];
        render();
      };
      el.querySelector("[data-act='up']").onclick = () => {
        syncFromDOM();
        const i = blocks.findIndex(x => x.id === bid);
        if (i > 0) { _pushHistory(); [blocks[i-1], blocks[i]] = [blocks[i], blocks[i-1]]; render(); }
      };
      el.querySelector("[data-act='down']").onclick = () => {
        syncFromDOM();
        const i = blocks.findIndex(x => x.id === bid);
        if (i < blocks.length - 1) { _pushHistory(); [blocks[i+1], blocks[i]] = [blocks[i], blocks[i+1]]; render(); }
      };
      /* 程式碼執行 */
      const runBtn = el.querySelector("[data-act='run-preview']");
      if (runBtn) runBtn.onclick = e => {
        e.stopPropagation();
        try { syncFromDOM(); } catch {}
        const b = blocks.find(x => x.id === bid);
        const output = el.querySelector("[data-run-output]");
        const frame = el.querySelector("[data-run-frame]");
        const textOut = el.querySelector("[data-run-text]");
        if (!b || !output) return;
        const lang = b.data.language || "text";
        const code = b.data.code || "";
        output.style.display = "";
        // HTML：直接用 iframe 渲染（同步，不會卡住）
        if (lang === "html") {
          if (textOut) textOut.style.display = "none";
          if (frame) { frame.style.display = ""; frame.srcdoc = code; }
          return;
        }
        // JS/Python：非同步執行
        (async () => {
        try {
          if (textOut) { textOut.style.display = ""; textOut.textContent = "執行中…"; }
          if (frame) frame.style.display = "none";
          if (lang === "javascript") {
            // 在沙盒 iframe 執行，捕捉 console.log
            const logs = [];
            const wrapped = `<script>
              (function(){
                const logs = [];
                ["log","error","warn","info"].forEach(k => {
                  const orig = console[k];
                  console[k] = (...a) => { logs.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")); };
                });
                try { ${code} } catch(err) { logs.push("錯誤: " + err.message); }
                document.body.innerHTML = "<pre id='out'></pre>";
                document.getElementById("out").textContent = logs.join("\n") || "(無輸出)";
              })();
            <\/script>`;
            if (frame) { frame.style.display = ""; frame.srcdoc = wrapped; }
            if (textOut) textOut.style.display = "none";
          } else if (lang === "python") {
            // Pyodide 執行 Python
            if (!window._pyodide) {
              textOut.textContent = "載入 Python 環境中（首次約需 10 秒）…";
              window._pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
            }
            const py = window._pyodide;
            py.runPython(`
import sys
from io import StringIO
_sys_out = StringIO()
sys.stdout = _sys_out
sys.stderr = _sys_out
`);
            try {
              py.runPython(code);
              const out = py.runPython("_sys_out.getvalue()");
              textOut.textContent = out || "(無輸出)";
            } catch (err) {
              let out = "";
              try { out = py.runPython("_sys_out.getvalue()"); } catch {}
              textOut.textContent = (out ? out + "\n" : "") + "錯誤: " + err.message;
            }
          }
        } catch (err) {
          if (textOut) { textOut.style.display = ""; textOut.textContent = "執行失敗: " + err.message; }
        }
        })();
      };
      /* 程式碼即時預覽 */
      const codeInput = el.querySelector('[data-code-input]');
      if (codeInput) {
        let _ct = null;
        codeInput.addEventListener("input", () => {
          clearTimeout(_ct);
          _ct = setTimeout(() => { syncFromDOM(); render(); }, 800);
        });
      }
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
  /* 全域快捷鍵：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y（非輸入框時才攔截） */
  if (!container._kbBound) {
    container._kbBound = true;
    container.setAttribute("tabindex", "-1");
    container.addEventListener("keydown", e => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !inField) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y" && !inField) {
        e.preventDefault();
        redo();
      }
    });
  }

  return {
    getBlocks() { syncFromDOM(); return blocks; },
    setBlocks(nb) { blocks = nb && nb.length ? nb : [newBlock("paragraph")]; _pushHistory(); render(); },
    undo, redo,
  };
}
