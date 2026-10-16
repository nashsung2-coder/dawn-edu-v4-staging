/* 蘇格拉底對話：多輪引導式學習
* 流程：主題設定 → 用戶提問 → AI 用問題反問 → 用戶思考回答 → AI 找漏洞 → 循環 → 總結存檔
*/
import { supabase} from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js";
import { ask, MODELS} from "../core/llm.js";

await renderTopbar("socratic.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

let topic = "", scope = "";
let history = []; // {role: "user"|"ai", text}
let round = 0;
const MAX_ROUNDS = 8;

const $ = id => document.getElementById(id);

function showStep(n) {
document.querySelectorAll(".soc-step").forEach(el => el.classList.remove("on"));
$(`step${n}`).classList.add("on");
}

function addMsg(role, text) {
const div = document.createElement("div");
div.className = `soc-msg ${role}`;
div.innerHTML = `<div class="role">${role === "ai"? "蘇格拉底 AI": "你"}</div><div>${esc(text).replace(/\n/g, "<br>")}</div>`;
$("soc-msgs").appendChild(div);
div.scrollIntoView({ behavior: "smooth", block: "nearest"});
history.push({ role, text});
}

function showTyping() {
const div = document.createElement("div");
div.className = "soc-msg ai";
div.id = "soc-typing";
div.innerHTML = `<div class="role">蘇格拉底 AI</div><div class="typing"><span>●</span><span>●</span><span>●</span></div>`;
$("soc-msgs").appendChild(div);
div.scrollIntoView({ behavior: "smooth", block: "nearest"});
}
function hideTyping() {
document.getElementById("soc-typing")?.remove();
}

/* AI 系統提示：蘇格拉底式導師 */
function systemPrompt() {
return `你是蘇格拉底式的導師，用繁體中文對話。主題是「${topic}」，內容範圍：${scope}。

你的規則：
1. 絕不直接給答案。用戶提問時，用 2-3 個引導性問題反問，讓用戶自己思考。
2. 用戶回答後，仔細找出他思考中的漏洞、矛盾或跳躍之處，指出來並用更深的問題追問。
3. 問題要由淺入深，一次不要問太多（2-3 個為限）。
4. 語氣像朋友聊天，不要像考試。
5. 如果用戶的思考已經很完整，肯定他並幫他整理思路。
6. 每輪回覆控制在 150 字以內。

現在是第 ${round + 1} 輪對話。`;
}

async function aiRespond(userText) {
showTyping();
try {
const messages = [
{ role: "system", content: systemPrompt()},
...history.slice(-6).map(h => ({
role: h.role === "ai"? "assistant": "user",
content: h.text
})),
{ role: "user", content: userText}
];
// 用 chat 直接傳多輪歷史
const { chat} = await import("../core/llm.js");
const reply = await chat(messages, { model: MODELS.socratic});
hideTyping();
addMsg("ai", reply);
round++;
if (round >= MAX_ROUNDS) {
addMsg("ai", "我們已經深入探討了好幾輪！如果你覺得理解了，可以點「我懂了，結束對話」來總結。");
}
} catch (e) {
hideTyping();
addMsg("ai", "抱歉，我剛才恍神了。可以再說一次嗎？");
}
}

/* Step 1: 開始 */
$("soc-start").onclick = async () => {
topic = $("soc-title").value.trim();
scope = $("soc-scope").value.trim();
if (!topic) { toast("請先輸入主題標題"); return;}
if (!scope) { toast("請簡單描述這個主題涵蓋哪些內容"); return;}

$("soc-topic-display").textContent = topic;
$("soc-scope-display").textContent = scope;
showStep(2);

// AI 開場：根據主題和範圍提出第一個引導問題
showTyping();
try {
const reply = await ask(
`你是蘇格拉底式的導師，用繁體中文。學生想學「${topic}」，他描述的內容範圍是：${scope}。請用親切的語氣開場，並提出 1-2 個引導性問題，了解他目前對這個主題的理解程度。100 字以內。`,
`我想學：${topic}`,
{ model: MODELS.socratic}
);
hideTyping();
addMsg("ai", reply);
} catch {
hideTyping();
addMsg("ai", `好，我們來聊聊「${topic}」。你對這個主題最想搞懂的是什麼？`);
}
};

/* Step 2: 對話 */
async function send() {
const text = $("soc-input").value.trim();
if (!text) return;
$("soc-input").value = "";
addMsg("user", text);
await aiRespond(text);
}
$("soc-send").onclick = send;
$("soc-input").addEventListener("keydown", e => {
if (e.key === "Enter") send();
});

$("soc-finish").onclick = async () => {
if (history.length < 2) { toast("還沒開始對話呢"); return;}
showStep(3);
$("soc-summary").innerHTML = `<p style="color:var(--paper-400);">AI 正在整理對話精華…</p>`;
try {
const reply = await ask(
`你是學習總結助手，用繁體中文。根據以下蘇格拉底對話，整理出 3-5 個關鍵收穫點。每點一句話，用條列呈現。`,
`主題：${topic}\n\n對話記錄：\n${history.map(h => `${h.role === "ai"? "AI": "學生"}：${h.text}`).join("\n")}`,
{ model: MODELS.chat}
);
$("soc-summary").innerHTML = esc(reply).replace(/\n/g, "<br>");
$("soc-summary").dataset.raw = reply;
} catch {
$("soc-summary").innerHTML = `<p style="color:var(--paper-400);">總結失敗，但對話記錄已保留。</p>`;
}
};

$("soc-restart").onclick = () => {
if (!confirm("確定重新開始嗎？目前的對話會消失。")) return;
history = []; round = 0;
$("soc-msgs").innerHTML = "";
$("soc-title").value = ""; $("soc-scope").value = "";
showStep(1);
};

/* Step 3: 存為知識節點 */
$("soc-save").onclick = async () => {
const btn = $("soc-save");
btn.disabled = true;
try {
const summary = $("soc-summary").dataset.raw || $("soc-summary").innerText;
const dialogText = history.map(h => `${h.role === "ai"? "AI": "我"}：${h.text}`).join("\n\n");
const { error} = await supabase.from("knowledge_nodes").insert({
user_id: user.id,
title: `蘇格拉底對話：${topic}`,
content: `${topic}\n${scope}\n\n\n${summary}\n\n\n${dialogText}`,
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

$("soc-back-learn").onclick = () => location.href = "learn.html";
