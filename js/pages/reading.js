/* AI 跨語言閱讀：用學過的知識練想學的語言 */
import { renderTopbar, requireAuth, esc, toast } from "../core/ui.js";
import { renderTypeHistory } from "../core/learn-history.js";
import { ask } from "../core/llm.js";

const $ = id => document.getElementById(id);
const view = $("rd-view");

let supabase, user;
let settings = { lang: "en", langName: "英文", difficulty: "auto", shortAnswer: false };
let article = null, questions = [], currentQ = 0, score = 0, startTime = 0;
let userTopics = [];

/* 語言選項 */
const LANGS = [
  ["en", "英文"], ["ja", "日文"], ["ko", "韓文"], ["fr", "法文"],
  ["de", "德文"], ["es", "西班牙文"], ["it", "義大利文"], ["pt", "葡萄牙文"],
  ["ru", "俄文"], ["ar", "阿拉伯文"], ["th", "泰文"], ["vi", "越南文"],
];

async function init() {
  await renderTopbar("reading");
  user = await requireAuth();
  ({ supabase } = await import("../core/supabase.js"));
  // 載入設定
  try {
    const s = JSON.parse(localStorage.getItem(`reading_settings_${user.id}`) || "{}");
    Object.assign(settings, s);
  } catch {}
  // 載入用戶的知識主題
  try {
    const { data } = await supabase.from("knowledge_nodes")
      .select("title,category").eq("user_id", user.id).eq("is_public", true).limit(20);
    if (data) userTopics = data;
  } catch {}
  renderSetup();
  try { renderTypeHistory(supabase, user.id, "rd-history", "AI閱讀"); } catch {}
}

function renderSetup() {
  const langOpts = LANGS.map(([code, name]) =>
    `<option value="${code}" ${settings.lang === code ? "selected" : ""}>${name}</option>`).join("");
  view.innerHTML = `
    <div class="rd-setup">
      <div class="rd-field">
        <label>想學的語言</label>
        <select id="rd-lang">${langOpts}</select>
      </div>
      <div class="rd-field">
        <label>難度</label>
        <select id="rd-diff">
          <option value="auto" ${settings.difficulty === "auto" ? "selected" : ""}>AI 自動調整</option>
          <option value="easy" ${settings.difficulty === "easy" ? "selected" : ""}>簡單</option>
          <option value="medium" ${settings.difficulty === "medium" ? "selected" : ""}>中等</option>
          <option value="hard" ${settings.difficulty === "hard" ? "selected" : ""}>困難</option>
        </select>
      </div>
      <div class="rd-field">
        <label class="rd-toggle">
          <input type="checkbox" id="rd-short" ${settings.shortAnswer ? "checked" : ""}>
          <span>加入簡答題（挑戰用目標語言寫出答案）</span>
        </label>
      </div>
      ${userTopics.length ? `
      <div class="rd-field">
        <label>主題（從你的知識庫選，或讓 AI 決定）</label>
        <select id="rd-topic">
          <option value="">AI 自動選擇</option>
          ${userTopics.map(t => `<option value="${esc(t.title)}">${esc(t.title)}（${esc(t.category || "未分類")}）</option>`).join("")}
        </select>
      </div>` : ""}
      <button class="rd-btn" id="rd-start">開始閱讀</button>
    </div>`;
  $("rd-start").onclick = startReading;
}

async function startReading() {
  settings.lang = $("rd-lang").value;
  settings.langName = LANGS.find(([c]) => c === settings.lang)?.[1] || settings.lang;
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
    renderArticle();
  } catch (e) {
    view.innerHTML = `<p style="color:var(--signal-red);">生成失敗：${esc(e.message)}，請重試。</p><button class="rd-btn ghost" onclick="location.reload()">重來</button>`;
  }
}

async function generateArticle(topicHint) {
  // 決定難度描述
  let diffDesc = { easy: "簡單（基礎單字、短句）", medium: "中等（常見單字、複合句）", hard: "困難（進階單字、長難句）" }[settings.difficulty] || "";
  if (settings.difficulty === "auto") {
    const stats = getStats();
    const avgAcc = stats.total ? stats.correct / stats.total : 0.7;
    diffDesc = avgAcc > 0.85 ? "困難（進階單字、長難句）" : avgAcc > 0.6 ? "中等（常見單字、複合句）" : "簡單（基礎單字、短句）";
  }
  const topic = topicHint || (userTopics.length ? userTopics[Math.floor(Math.random() * userTopics.length)].title : "科學");
  const qCount = 4;
  const shortQ = settings.shortAnswer ? "其中 1 題必須是簡答題（用目標語言寫 2-3 句回答）" : "全部為選擇題";

  const system = `你是一位${settings.langName}閱讀教材編寫專家。用繁體中文思考，但輸出${settings.langName}文章和題目。`;
  const prompt = `主題：「${topic}」。寫一篇${settings.langName}短文（約 250-350 字），難度：${diffDesc}。
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
  /* 寫入學習歷程 */
  (async () => {
    try {
      const { logLearnHistory, refreshHistoryUI } = await import("../core/learn-history.js");
      await logLearnHistory(supabase, user.id, {
        type: "AI閱讀",
        topic: article.title || `${settings.langName}閱讀`,
        detail: `${settings.langName}・答對 ${score}/${questions.length} 題・正確率 ${acc}%`,
        link: "reading.html",
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
