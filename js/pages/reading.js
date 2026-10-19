/* AI 跨語言閱讀：用學過的知識練想學的語言 */
import { renderTopbar, requireAuth, esc, toast } from "../core/ui.js";
import { renderTypeHistory } from "../core/learn-history.js";
import { ask } from "../core/llm.js";
import { blocksText } from "../core/blocks.js";

const $ = id => document.getElementById(id);
const view = $("rd-view");

let supabase, user;
let settings = { lang: "en", langName: "英文", difficulty: "auto", shortAnswer: false };
let article = null, questions = [], currentQ = 0, score = 0, startTime = 0;
let userTopics = [], userOwnTopics = [], userFavTopics = [];
let sessionId = null;   // learn_sessions id（恢復進度用）
let answers = [];       // 每題作答紀錄

/* 快照：每答一題存一次，歷史點開可回到當時的題目 */
async function saveSnap(extra = {}) {
  if (!sessionId) return;
  try {
    const { saveLearnSession } = await import("../core/learn-history.js");
    saveLearnSession(supabase, sessionId, {
      settings, article, questions, currentQ, score, answers,
      done: false, ...extra,
    });
  } catch {}
}

/* 語言選項 */
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
/* 各語言的主流評測標準：英文/歐語系 CEFR、日文 JLPT、韓文 TOPIK */
const LANGS = [
  { code: "en", name: "英文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "ja", name: "日文", fw: "JLPT", levels: ["N5", "N4", "N3", "N2", "N1"] },
  { code: "ko", name: "韓文", fw: "TOPIK", levels: ["1級", "2級", "3級", "4級", "5級", "6級"] },
  { code: "fr", name: "法文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "de", name: "德文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "es", name: "西班牙文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "it", name: "義大利文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "pt", name: "葡萄牙文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "ru", name: "俄文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "ar", name: "阿拉伯文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "th", name: "泰文", fw: "CEFR", levels: CEFR_LEVELS },
  { code: "vi", name: "越南文", fw: "CEFR", levels: CEFR_LEVELS },
];
/* 程度標籤（下拉選單用）＋ 出題規格（餵給 AI 用：字彙帶、句型、篇幅，空泛形容詞校準不了模型） */
const LEVEL_DESC = {
  CEFR: {
    A1: { label: "入門", spec: "約 80–120 個英文單字；只用最高頻約 1000 個基礎單字；只用簡單現在式與過去式；每句平均不超過 10 個字；幾乎不用從屬子句；主題限具體日常生活（自我介紹、家庭、食物）；題目只考字面理解" },
    A2: { label: "初級", spec: "約 150–200 個英文單字；高頻 2000 字範圍；可用 and/but/because/so 連接；簡單過去式與未來式；短段落；日常主題；題目考細節查找" },
    B1: { label: "中級", spec: "約 250–350 個英文單字；3000–4000 字彙量；複合句、although/however 引導的從屬子句、第一第二條件句；主題為熟悉領域（學校、旅行、興趣），可含少量抽象討論；題目考主旨歸納與簡單推論" },
    B2: { label: "中高級", spec: "約 300–400 個英文單字；5000 字以上字彙，含片語動詞與慣用搭配；被動語態、多重從屬子句；抽象議題論述（科技、環境、社會）；須能理解言外之意；題目考論點結構與言外之意" },
    C1: { label: "高級", spec: "約 350–450 個英文單字；8000 字以上字彙，含低頻學術字彙與名詞化結構；長難句、多重嵌套子句；學術或專業文本；須理解隱含意義、語氣與文體差異；題目考細微語氣、論證手法評估" },
    C2: { label: "精通", spec: "約 400–500 個英文單字；近母語者水準：低頻精確字彙、慣用語、雙關、文化典故、反諷幽默；文學性或高度抽象文本；複雜修辭與精確的文體掌控；題目考深層隱含意義、文體賞析與批判性理解" },
  },
  JLPT: {
    N5: { label: "入門", spec: "約 150–250 字；平假名、片假名、基礎漢字約 100 字；です・ます體；短句為主；日常生活主題；題目考字面理解" },
    N4: { label: "初級", spec: "約 250–400 字；漢字約 300 字；て形・ない形・可能形・意向形等基本變化；日常會話與短文；題目考細節查找" },
    N3: { label: "中級", spec: "約 400–600 字；漢字約 650 字；複合句、授受動詞、條件形、間接表達；日常加部分抽象話題；題目考主旨與推論" },
    N2: { label: "中高級", spec: "約 600–800 字；漢字約 1000 字；新聞、論說文體；敬語、使役、被動、使役被動等複雜文法；理解文章論點結構；題目考論點與言外之意" },
    N1: { label: "高級", spec: "約 800–1000 字；漢字約 2000 字；學術、文學、社論；慣用語、雙關、細膩語感；理解深層含義與作者立場；題目考深層解讀與批判理解" },
  },
  TOPIK: {
    "1級": { label: "入門", spec: "約 100–200 字；基礎單字約 800 個；簡單句；自我介紹、日常生活主題" },
    "2級": { label: "初級", spec: "約 200–350 字；單字 1500–2000 個；-고/-지만 等基本連接詞；日常生活對話與短文" },
    "3級": { label: "中級", spec: "約 350–500 字；單字約 3000 個；間接引語、被動形；熟悉主題的完整敘述" },
    "4級": { label: "中高級", spec: "約 500–700 字；單字 4000 個以上；正式文體、新聞報導；社會議題論述" },
    "5級": { label: "高級", spec: "約 700–900 字；單字 6000 個以上；專業領域文本；抽象論述與論證結構" },
    "6級": { label: "精通", spec: "約 900–1100 字；近母語者水準；文學、社論；慣用語、文化背景知識；理解深層含義與批判觀點" },
  },
};
const langOf = code => LANGS.find(l => l.code === code) || LANGS[0];
/* 難度下拉選項：AI 自動調整＋該語言評測標準的級別 */
function diffOptions(langCode, current) {
  const L = langOf(langCode);
  const cur = ["auto", ...L.levels].includes(current) ? current : "auto";
  const opts = [`<option value="auto" ${cur === "auto" ? "selected" : ""}>AI 自動調整</option>`];
  for (const lv of L.levels) {
    const label = LEVEL_DESC[L.fw]?.[lv]?.label || "";
    opts.push(`<option value="${lv}" ${cur === lv ? "selected" : ""}>${L.fw} ${lv}（${label}）</option>`);
  }
  return opts.join("");
}
/* 難度描述（餵給 AI 的 prompt 用） */
function diffDescFor(level, langCode) {
  const L = langOf(langCode);
  if (level === "auto") {
    const stats = getStats();
    const avgAcc = stats.total ? stats.correct / stats.total : 0.7;
    const lv = avgAcc > 0.85 ? L.levels[L.levels.length - 2]
      : avgAcc > 0.6 ? L.levels[Math.floor(L.levels.length / 2)] : L.levels[1];
    return `${L.fw} ${lv}：${LEVEL_DESC[L.fw]?.[lv]?.spec || ""}`;
  }
  return `${L.fw} ${level}：${LEVEL_DESC[L.fw]?.[level]?.spec || ""}`;
}

async function init() {
  await renderTopbar("reading");
  user = await requireAuth();
  ({ supabase } = await import("../core/supabase.js"));
  // 載入設定
  try {
    const s = JSON.parse(localStorage.getItem(`reading_settings_${user.id}`) || "{}");
    Object.assign(settings, s);
  } catch {}
  // 載入用戶的知識主題（自己的＋收藏的）
  try {
    const { data } = await supabase.from("knowledge_nodes")
      .select("title,category").eq("user_id", user.id).eq("is_public", true).limit(30);
    userOwnTopics = data || [];
    userFavTopics = [];
    try {
      const { data: favRows } = await supabase.from("node_favorites").select("node_id").eq("user_id", user.id);
      if (favRows?.length) {
        const ids = favRows.map(f => f.node_id);
        const { data: favNodes } = await supabase.from("knowledge_nodes")
          .select("title,category").in("id", ids).eq("is_public", true).limit(30);
        if (favNodes) userFavTopics = favNodes.filter(n => !userOwnTopics.some(o => o.title === n.title));
      }
    } catch {}
    userTopics = [...userOwnTopics, ...userFavTopics];
  } catch {}
  /* 從歷史點開：恢復當時的作答進度 */
  try {
    const sid = new URLSearchParams(location.search).get("session");
    if (sid) {
      const { loadLearnSession } = await import("../core/learn-history.js");
      const row = await loadLearnSession(supabase, sid, user.id);
      const st = row?.state;
      if (st?.article && st?.questions?.length) {
        sessionId = sid;
        settings = { ...settings, ...st.settings };
        article = st.article; questions = st.questions;
        currentQ = st.currentQ || 0; score = st.score || 0;
        answers = st.answers || [];
        startTime = Date.now();
        if (st.done) renderRestoredResult(st);
        else if (currentQ > 0 || answers.length) renderQuestion();
        else renderArticle();
        toast("已回到上次的進度");
        try { renderTypeHistory(supabase, user.id, "rd-history", "AI閱讀"); } catch {}
        return;
      }
    }
  } catch {}
  renderSetup();
  try { renderTypeHistory(supabase, user.id, "rd-history", "AI閱讀"); } catch {}
}

/* 從快照恢復已完成的結果（不重跑記分） */
function renderRestoredResult(st) {
  const acc = st.acc ?? (questions.length ? Math.round(score / questions.length * 100) : 0);
  view.innerHTML = `
    <div style="text-align:center;padding:40px 0;">
      <div style="font-size:13px;color:var(--paper-400);margin-bottom:8px;">上次的閱讀紀錄・${esc(article.title || "")}</div>
      <div style="font-size:48px;font-weight:700;color:var(--brass-300);">${acc}%</div>
      <p style="color:var(--paper-400);">答對 ${score}/${questions.length} 題</p>
      <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
        <button class="rd-btn" id="rd-again">再讀一篇</button>
        <button class="rd-btn ghost" onclick="location.href='dashboard.html'">回主控台</button>
      </div>
    </div>`;
  $("rd-again").onclick = () => { renderSetup(); };
}

function renderSetup() {
  const langOpts = LANGS.map(l =>
    `<option value="${l.code}" ${settings.lang === l.code ? "selected" : ""}>${l.name}</option>`).join("");
  const curLang = langOf(settings.lang);
  view.innerHTML = `
    <div class="rd-setup">
      <div class="rd-field">
        <label>想學的語言</label>
        <select id="rd-lang">${langOpts}</select>
      </div>
      <div class="rd-field">
        <label id="rd-diff-label">程度（${curLang.fw}）</label>
        <select id="rd-diff">${diffOptions(settings.lang, settings.difficulty)}</select>
      </div>
      <div class="rd-field">
        <label class="rd-toggle">
          <input type="checkbox" id="rd-short" ${settings.shortAnswer ? "checked" : ""}>
          <span>加入簡答題（挑戰用目標語言寫出答案）</span>
        </label>
      </div>
      ${userTopics.length ? `
      <div class="rd-field">
        <label>主題（從你的曙光寶庫選，或讓 AI 決定）</label>
        <select id="rd-topic">
          <option value="">AI 自動選擇</option>
          <optgroup label="我的寶庫">
          ${userOwnTopics.map(t => `<option value="${esc(t.title)}">${esc(t.title)}（${esc(t.category || "未分類")}）</option>`).join("")}
          </optgroup>
          ${userFavTopics.length ? `<optgroup label="收藏的">
          ${userFavTopics.map(t => `<option value="${esc(t.title)}">${esc(t.title)}（${esc(t.category || "未分類")}）</option>`).join("")}
          </optgroup>` : ""}
        </select>
      </div>` : ""}
      <button class="rd-btn" id="rd-start">開始閱讀</button>
    </div>`;
  $("rd-start").onclick = startReading;
  /* 切換語言時重建該語言評測標準的級別選項 */
  $("rd-lang").onchange = (e) => {
    settings.lang = e.target.value;
    const L = langOf(settings.lang);
    $("rd-diff-label").textContent = `程度（${L.fw}）`;
    $("rd-diff").innerHTML = diffOptions(settings.lang, "auto");
    settings.difficulty = "auto";
  };
}

async function startReading() {
  settings.lang = $("rd-lang").value;
  settings.langName = langOf(settings.lang).name;
  settings.difficulty = $("rd-diff").value;
  settings.shortAnswer = $("rd-short").checked;
  const topicSel = $("rd-topic");
  const topic = topicSel ? topicSel.value : "";
  localStorage.setItem(`reading_settings_${user.id}`, JSON.stringify(settings));

  view.innerHTML = `<p style="color:var(--paper-400);">AI 正在為你生成${settings.langName}文章…</p>`;
  try {
    const result = await generateArticle(topic);
    article = result.article;
    questions = result.questions;
    currentQ = 0; score = 0; startTime = Date.now();
    answers = [];
    /* 建立學習會話：每答一題存快照，歷史可點開回到當時的題目 */
    try {
      const { createLearnSession } = await import("../core/learn-history.js");
      sessionId = await createLearnSession(supabase, user.id, "AI閱讀", article.title || article.topic);
    } catch {}
    renderArticle();
    saveSnap();
  } catch (e) {
    view.innerHTML = `<p style="color:var(--signal-red);">生成失敗：${esc(e.message)}，請重試。</p><button class="rd-btn ghost" onclick="location.reload()">重來</button>`;
  }
}

async function generateArticle(topicHint) {
  // 決定難度描述：依該語言的主流評測標準（CEFR / JLPT / TOPIK）
  const diffDesc = diffDescFor(settings.difficulty, settings.lang);
  const topic = topicHint || (userTopics.length ? userTopics[Math.floor(Math.random() * userTopics.length)].title : "科學");
  const qCount = 4;
  const shortQ = settings.shortAnswer ? "其中 1 題必須是簡答題（用目標語言寫 2-3 句回答）" : "全部為選擇題";
  /* 若主題來自寶庫：抓該節點內容當素材，文章與題目嚴格根據素材 */
  let srcRef = "";
  try {
    const { data } = await supabase.from("knowledge_nodes")
      .select("id,title,content,user_id,is_public").eq("title", topic).limit(5);
    const row = (data || []).find(r => String(r.user_id) === String(user.id) || r.is_public) || (data || [])[0];
    if (row) {
      let txt = "";
      try {
        const parsed = JSON.parse(row.content || "{}");
        txt = blocksText(parsed.blocks || (Array.isArray(parsed) ? parsed : []));
      } catch { txt = row.content || ""; }
      if (txt.trim()) {
        srcRef = `\n\n以下是曙光寶庫中「${topic}」的完整內容（繁體中文）。請嚴格根據這份素材、用${settings.langName}改寫成短文，不要加入素材之外的資訊：\n---\n${txt.trim().slice(0, 4000)}\n---`;
      }
    }
  } catch {}

  const system = `你是一位${settings.langName}閱讀教材編寫專家。用繁體中文思考，但輸出${settings.langName}文章和題目。`;
  const prompt = `主題：「${topic}」。寫一篇${settings.langName}短文，難度規格如下——${diffDesc}。篇幅與用字必須符合規格，不可降級簡化。${srcRef}
然後出 ${qCount} 道閱讀理解題：${shortQ}。
選擇題每題 4 個選項，標明正確答案。
輸出 JSON 格式：
{"title":"文章標題（${settings.langName}）","article":"文章全文（${settings.langName}，段落用\\n\\n分隔）","questions":[{"type":"choice","q":"題目（${settings.langName}）","options":["A...","B...","C...","D..."],"answer":0,"explain":"解析（繁體中文）"},{"type":"short","q":"題目（${settings.langName}）","sample":"參考答案（${settings.langName}）","explain":"解析（繁體中文）"}]}
只輸出 JSON，不要其他文字。`;

  const raw = await ask(system, prompt, { model: "fast", json: true });
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (m) {
      try { data = JSON.parse(m[0]); } catch {}
    }
  }
  if (!data?.article || !data?.questions) throw new Error("AI 回傳格式錯誤，請重試");
  return { article: { title: data.title, body: data.article, topic }, questions: data.questions };
}

function renderArticle() {
  const paras = article.body.split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join("");
  view.innerHTML = `
    <div class="rd-stats">
      <div>主題<br><b>${esc(article.topic)}</b></div>
      <div>語言<br><b>${esc(settings.langName)}</b></div>
    </div>
    <div class="rd-article"><h2>${esc(article.title)}</h2>${paras}</div>
    <button class="rd-btn" id="rd-to-q">開始作答（${questions.length} 題）</button>`;
  $("rd-to-q").onclick = () => { startTime = Date.now(); renderQuestion(); };
}

function renderQuestion() {
  const q = questions[currentQ];
  const prog = questions.map((_, i) =>
    `<i class="${i < currentQ ? "done" : i === currentQ ? "cur" : ""}"></i>`).join("");
  let qHtml = `<div class="rd-progress">${prog}</div><div class="rd-q"><h3>Q${currentQ + 1}. ${esc(q.q)}</h3>`;

  if (q.type === "choice") {
    qHtml += q.options.map((opt, i) =>
      `<button class="rd-opt" data-i="${i}">${esc(opt)}</button>`).join("");
  } else {
    qHtml += `<textarea class="rd-short" id="rd-short-a" placeholder="用${settings.langName}回答（2-3 句）"></textarea>
      <button class="rd-btn" id="rd-submit-short">提交</button>`;
  }
  qHtml += `<div id="rd-feedback"></div></div>`;
  view.innerHTML = qHtml;

  if (q.type === "choice") {
    view.querySelectorAll(".rd-opt").forEach(btn => {
      btn.onclick = () => answerChoice(parseInt(btn.dataset.i));
    });
  } else {
    $("rd-submit-short").onclick = answerShort;
  }
}

function answerChoice(idx) {
  const q = questions[currentQ];
  const correct = idx === q.answer;
  if (correct) score++;
  answers.push({ ok: correct });
  saveSnap();
  view.querySelectorAll(".rd-opt").forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add("correct");
    else if (i === idx) btn.classList.add("wrong");
  });
  $("rd-feedback").innerHTML = `
    <div class="rd-explain">${correct ? "✓ 答對了！" : "✗ 答錯了"}<br>${esc(q.explain || "")}</div>
    <button class="rd-btn" style="margin-top:12px;" id="rd-next">${currentQ + 1 < questions.length ? "下一題" : "看結果"}</button>`;
  $("rd-next").onclick = nextQuestion;
  recordStat(correct);
}

async function answerShort() {
  const ans = $("rd-short-a").value.trim();
  if (!ans) { toast("請先寫下你的答案"); return; }
  const q = questions[currentQ];
  $("rd-submit-short").disabled = true;
  $("rd-feedback").innerHTML = `<p style="color:var(--paper-400);">AI 評分中…</p>`;
  try {
    const system = "你是一位嚴格但鼓勵的語言老師。用繁體中文回覆。";
    const prompt = `題目：${q.q}\n參考答案：${q.sample}\n學生答案：${ans}\n請評分（0-100）並給一句回饋。輸出 JSON：{"score":85,"feedback":"..."}`;
    const raw = await ask(system, prompt, { model: "fast", json: true });
    const r = typeof raw === "string" ? JSON.parse(raw) : raw;
    const correct = r.score >= 60;
    if (correct) score++;
    answers.push({ ok: correct, score: r.score });
    saveSnap();
    $("rd-feedback").innerHTML = `
      <div class="rd-explain">得分：${r.score}/100<br>${esc(r.feedback)}<br><br>參考答案：${esc(q.sample)}<br>${esc(q.explain || "")}</div>
      <button class="rd-btn" style="margin-top:12px;" id="rd-next">${currentQ + 1 < questions.length ? "下一題" : "看結果"}</button>`;
    $("rd-next").onclick = nextQuestion;
    recordStat(correct);
  } catch (e) {
    $("rd-feedback").innerHTML = `<p style="color:var(--signal-red);">評分失敗，請重試。</p>`;
    $("rd-submit-short").disabled = false;
  }
}

function nextQuestion() {
  currentQ++;
  saveSnap();
  if (currentQ < questions.length) renderQuestion();
  else renderResult();
}

function renderResult() {
  const mins = ((Date.now() - startTime) / 60000).toFixed(1);
  const acc = questions.length ? Math.round(score / questions.length * 100) : 0;
  // 記錄閱讀速度
  try {
    const words = article.body.split(/\s+/).length;
    const wpm = Math.round(words / parseFloat(mins));
    const h = JSON.parse(localStorage.getItem(`reading_history_${user.id}`) || "[]");
    h.push({ date: Date.now(), lang: settings.lang, wpm, acc });
    localStorage.setItem(`reading_history_${user.id}`, JSON.stringify(h.slice(-30)));
  } catch {}
  /* 寫入學習歷程（帶 session，點開可回到這次閱讀） */
  (async () => {
    try {
      const { logLearnHistory, refreshHistoryUI, sessionLink } = await import("../core/learn-history.js");
      await saveSnap({ done: true, acc, mins });
      await logLearnHistory(supabase, user.id, {
        type: "AI閱讀",
        topic: article.title || `${settings.langName}閱讀`,
        detail: `${settings.langName}・答對 ${score}/${questions.length} 題・正確率 ${acc}%`,
        link: sessionLink("reading.html", sessionId),
      });
        await refreshHistoryUI(supabase, user.id);
  } catch {}
  })();
  view.innerHTML = `
    <div style="text-align:center;padding:40px 0;">
      <div style="font-size:48px;font-weight:700;color:var(--brass-300);">${acc}%</div>
      <p style="color:var(--paper-400);">答對 ${score}/${questions.length} 題 · 用時 ${mins} 分鐘</p>
      <p style="color:var(--paper-400);font-size:13px;">${acc >= 80 ? "很棒！可以試試更難的文章，或開啟簡答題挑戰。" : acc >= 60 ? "不錯，繼續加油！" : "沒關係，多讀就會進步。下次試試簡單一點的。"}</p>
      <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
        <button class="rd-btn" id="rd-again">再讀一篇</button>
        <button class="rd-btn ghost" onclick="location.href='dashboard.html'">回主控台</button>
      </div>
    </div>`;
  $("rd-again").onclick = () => { renderSetup(); };
}

function getStats() {
  try {
    return JSON.parse(localStorage.getItem(`reading_stats_${user.id}_${settings.lang}`) || '{"correct":0,"total":0}');
  } catch { return { correct: 0, total: 0 }; }
}
function recordStat(correct) {
  try {
    const s = getStats();
    s.total++; if (correct) s.correct++;
    localStorage.setItem(`reading_stats_${user.id}_${settings.lang}`, JSON.stringify(s));
  } catch {}
}

init();
