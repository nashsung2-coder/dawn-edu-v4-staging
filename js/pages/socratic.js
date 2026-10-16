/* 蘇格拉底對話 v2：GPT 式介面 + 右側知識整理區 */
import { supabase} from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js";
import { ask, chat, MODELS} from "../core/llm.js";

const $ = id => document.getElementById(id);

// 從編輯器帶過來的主題
try {
const st = sessionStorage.getItem("socratic_topic");
if (st) { $("soc-title").value = st; sessionStorage.removeItem("socratic_topic");}
} catch {}

let topic = "", scope = "";
let history = [];
let round = 0;
const MAX_ROUNDS = 10;

function showErr(msg) {
const el = $("soc-err");
el.textContent = msg;
el.style.display = "block";
}

function addMsg(role, text) {
const div = document.createElement("div");
div.className = `soc-msg ${role}`;
div.innerHTML = `<div class="role">${role === "ai"? "蘇格拉底 AI": "你"}</div><div>${esc(text).replace(/\n/g, "<br>")}</div>`;
$("soc-msgs").appendChild(div);
$("soc-msgs").scrollTop = $("soc-msgs").scrollHeight;
history.push({ role, text});
$("soc-round-display").textContent = `第 ${round} 輪`;
}

function showTyping() {
const div = document.createElement("div");
div.className = "soc-msg ai"; div.id = "soc-typing";
div.innerHTML = `<div class="role">蘇格拉底 AI</div><div class="typing"><span>●</span><span>●</span><span>●</span></div>`;
$("soc-msgs").appendChild(div);
$("soc-msgs").scrollTop = $("soc-msgs").scrollHeight;
}
function hideTyping() { $("soc-typing")?.remove();}

function systemPrompt() {
return `你是蘇格拉底式的導師，用繁體中文對話。主題是「${topic}」，內容範圍：${scope}。

你的提問風格（非常重要）：
- 絕對不要出「考試題」。例如不要問「宋朝的經濟制度有什麼特點？」「你對賦稅制度了解多少？」這種像在考默寫的問題。
- 要出「引導思考題」：把用戶代入情境，讓他從某個角度去想。例如：「如果你是宋太祖，剛打下江山，國庫空虛，你第一個想動的是哪塊收入？」「想像你是個杭州商人，要把絲綢運到開封賣，你覺得路上最大的麻煩會是什麼？」
- 好的引導問題沒有標準答案，重點是讓用戶開始思考、建立直覺。
- 可以用「如果…你會…」「想像…」「你覺得為什麼…」開頭。

你的規則：
1. 絕不直接給答案。用戶提問時，用 2-3 個情境式引導問題反問。
2. 遇到「我不了解 X」時，先把 X 拆解成關鍵脈絡（時代背景、環境因素、關鍵人物、制度動機），從最基礎的一層開始，用情境問題一層層引導。
3. 用戶回答後，找出他思考中的漏洞或盲點，用更深的情境問題追問。
4. 一次問 2-3 個就好，不要多。
5. 語氣像朋友在咖啡廳聊天，輕鬆、好奇，不要像老師在考試。
6. 用戶想通了就肯定他，幫他把思路整理成一句話。
7. 每輪 150 字以內。

現在是第 ${round + 1} 輪對話。`;
}

async function aiRespond(userText) {
showTyping();
$("soc-send").disabled = true;
try {
const messages = [
{ role: "system", content: systemPrompt()},
...history.slice(-8).map(h => ({ role: h.role === "ai"? "assistant": "user", content: h.text})),
{ role: "user", content: userText}
];
const reply = await chat(messages, { model: MODELS.socratic});
hideTyping();
if (!reply ||!reply.trim()) throw new Error("empty");
addMsg("ai", reply);
round++;
if (round >= MAX_ROUNDS) {
addMsg("ai", "我們已經深入探討了好幾輪！如果覺得理解了，可以點「我懂了，結束」或用右側工具整理。");
}
} catch (e) {
hideTyping();
console.error("AI 回應失敗:", e);
addMsg("ai", `抱歉，AI 暫時沒回應（${e.message || "連線問題"}）。請再試一次，或檢查網路。`);
}
$("soc-send").disabled = false;
}

/* 開始 */
async function init() {
try {
await renderTopbar("socratic.html");
const user = await requireAuth();
await ensureProfile(supabase, user);
window._socUser = user;
} catch (e) {
showErr("載入失敗：" + e.message);
return;
}

$("soc-start").onclick = async () => {
topic = $("soc-title").value.trim();
scope = $("soc-scope").value.trim();
if (!topic) { toast("請先輸入主題標題"); return;}
if (!scope) { toast("請簡單描述這個主題涵蓋哪些內容"); return;}

$("soc-err").style.display = "none";
$("soc-setup").style.display = "none";
$("soc-main").style.display = "flex";
$("soc-topic-display").textContent = topic;

showTyping();
try {
const reply = await ask(
`你是蘇格拉底式的導師，用繁體中文。學生想學「${topic}」，他說的內容範圍是：${scope}。用親切的語氣開場（1句），然後用情境代入的方式提出 2 個引導性問題，了解他目前的理解程度。不要出考試題，要用「如果你是…」「想像…」開頭。150 字以內。`,
`我想學：${topic}`,
{ model: MODELS.socratic}
);
hideTyping();
addMsg("ai", reply && reply.trim()? reply: `好，我們來聊聊「${topic}」。如果你是當時的人，面對${scope}，你覺得最大的難題會是什麼？`);
} catch (e) {
hideTyping();
console.error("開場失敗:", e);
addMsg("ai", `好，我們來聊聊「${topic}」。如果你是當時的人，面對${scope}，你覺得最大的難題會是什麼？（AI 連線有點不穩，但我們可以繼續聊）`);
}
};

async function send() {
const text = $("soc-input").value.trim();
if (!text || $("soc-send").disabled) return;
$("soc-input").value = "";
addMsg("user", text);
await aiRespond(text);
}
$("soc-send").onclick = send;
$("soc-input").addEventListener("keydown", e => { if (e.key === "Enter") send();});

/* 右側工具 */
$("tool-thread").onclick = async () => {
if (history.length < 2) { toast("還沒有對話內容"); return;}
const btn = $("tool-thread"); btn.disabled = true; btn.textContent = "整理中…";
try {
const reply = await ask(
`你是思考脈絡整理師。用繁體中文，根據以下對話，整理出用戶的思考路徑：他從哪裡開始、經過哪些關鍵轉折、目前理解到哪個層次。用 3-5 個短句條列，每句 20 字內。`,
`主題：${topic}\n\n${history.map(h => `${h.role === "ai"? "AI": "學生"}：${h.text}`).join("\n")}`,
{ model: MODELS.chat}
);
$("soc-thread").innerHTML = reply.split("\n").filter(l => l.trim()).slice(0, 6)
.map(l => `<div class="t-item">${esc(l.replace(/^[-•\d.、\s]+/, ""))}</div>`).join("");
toast("思考脈絡已整理");
} catch (e) { toast("整理失敗：" + e.message);}
btn.disabled = false; btn.textContent = "📝 整理思考脈絡";
};

$("tool-cards").onclick = async () => {
if (history.length < 2) { toast("還沒有對話內容"); return;}
const btn = $("tool-cards"); btn.disabled = true; btn.textContent = "生成中…";
try {
const reply = await ask(
`你是知識卡片生成器。用繁體中文，從以下對話中提取 3-5 個關鍵概念。每行一個，格式「概念：解釋（一句話）」。`,
`主題：${topic}\n\n${history.map(h => `${h.role === "ai"? "AI": "學生"}：${h.text}`).join("\n")}`,
{ model: MODELS.chat}
);
$("soc-cards").innerHTML = reply.split("\n").filter(l => l.trim()).slice(0, 6).map(l => {
const [term,...rest] = l.split(/[:：]/);
return `<div class="soc-kcard"><div class="k-term">${esc(term.replace(/^[-•\d.、\s]+/, ""))}</div><div>${esc(rest.join("："))}</div></div>`;
}).join("");
toast("知識卡片已生成");
} catch (e) { toast("生成失敗：" + e.message);}
btn.disabled = false; btn.textContent = "🗂️ 生成知識卡片";
};

$("tool-summary").onclick = async () => {
if (history.length < 2) { toast("還沒有對話內容"); return;}
const btn = $("tool-summary"); btn.disabled = true; btn.textContent = "總結中…";
try {
const reply = await ask(
`你是學習總結助手。用繁體中文，根據以下蘇格拉底對話，整理 3-5 個關鍵收穫。每點一句話，條列呈現。`,
`主題：${topic}\n\n${history.map(h => `${h.role === "ai"? "AI": "學生"}：${h.text}`).join("\n")}`,
{ model: MODELS.chat}
);
addMsg("ai", "📋 對話總結：\n" + reply);
toast("已在對話中顯示總結");
} catch (e) { toast("總結失敗：" + e.message);}
btn.disabled = false; btn.textContent = "✨ 對話總結";
};

/* 結束與儲存 */
$("soc-finish").onclick = () => {
if (history.length >= 2) $("tool-summary").click();
toast("可以用右側工具整理，或點儲存存為知識節點");
};

$("soc-save").onclick = async () => {
if (history.length < 2) { toast("還沒有對話內容可存"); return;}
const btn = $("soc-save"); btn.disabled = true;
try {
const threadHtml = $("soc-thread").innerText;
const cardsHtml = $("soc-cards").innerText;
const dialogText = history.map(h => `${h.role === "ai"? "AI": "我"}：${h.text}`).join("\n\n");
const { error} = await supabase.from("knowledge_nodes").insert({
user_id: window._socUser.id,
title: `蘇格拉底對話：${topic}`,
content: `${topic}\n${scope}\n\n\n${threadHtml}\n\n\n${cardsHtml}\n\n\n${dialogText}`,
category: "蘇格拉底對話",
is_public: false,
});
if (error) throw error;
toast("已存為知識節點");
btn.textContent = "已儲存 ✓";
} catch (e) {
toast("儲存失敗：" + e.message);
btn.disabled = false;
}
};
}

init();
