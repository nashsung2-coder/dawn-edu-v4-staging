/* 曙光學習 — AI 學習陪伴者「小曙」核心
 * 對話優先的學習 OS：AI 是主控台，功能是它的工具
 */
import { chat, MODELS } from "./llm.js";

/* 從 Supabase 讀取用戶學習狀態，組成 AI 的 context */
export async function buildLearningContext(supabase, userId) {
  const now = new Date().toISOString();
  const lines = [];
  try {
    const [review, nodes, battles, pet, profile] = await Promise.all([
      supabase.from("review_cards").select("id", { count: "exact", head: true }).eq("user_id", userId).lte("next_review_at", now),
      supabase.from("knowledge_nodes").select("id, title, category").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      supabase.from("battle_records").select("quiz_score, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("pets").select("name, hunger, mood").eq("user_id", userId).limit(1).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]);
    const dueCount = review.count ?? 0;
    lines.push(`到期複習任務：${dueCount} 個`);
    lines.push(`知識節點總數：${nodes.data?.length ?? 0}（最近：${(nodes.data || []).map(n => n.title).join("、") || "無"}）`);
    // 實際存在的寶庫分類（AI 只能推薦這些，不能瞎編）：自己的＋全站公開的
    try {
      const [{ data: ownNodes }, { data: pubNodes }] = await Promise.all([
        supabase.from("knowledge_nodes").select("category").eq("user_id", userId),
        supabase.from("knowledge_nodes").select("category").eq("is_public", true).neq("user_id", userId),
      ]);
      const ownCats = [...new Set((ownNodes || []).map(n => n.category).filter(Boolean))];
      const pubCats = [...new Set((pubNodes || []).map(n => n.category).filter(Boolean))].filter(c => !ownCats.includes(c));
      lines.push(`我的寶庫分類：${ownCats.length ? ownCats.join("、") : "（尚無）"}`);
      lines.push(`全站公開分類：${pubCats.length ? pubCats.join("、") : "（尚無）"}`);
      lines.push(`推薦寶庫分類時只能從以上兩組選擇，不能瞎編；公開分類的節點在曙光寶庫頁都看得到`);
    } catch {}
    if (battles.data?.length) {
      const avg = battles.data.reduce((s, b) => s + (b.quiz_score || 0), 0) / battles.data.length;
      lines.push(`最近 10 次學習平均分：${Math.round(avg)}`);
    }
    if (pet.data) lines.push(`靈獸「${pet.data.name}」：飢餓 ${pet.data.hunger}、心情 ${pet.data.mood}`);
    if (profile.data) {
      lines.push(`暱稱：${profile.data.nickname || "同學"}`);
      lines.push(`連續學習：${profile.data.streak_days || 0} 天`);
    }

  } catch (e) {
    lines.push("(學習數據讀取失敗)");
  }
  // 時間感知
  const h = new Date().getHours();
  const tod = h < 6 ? "深夜" : h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
  lines.push(`現在是${tod}`);
  return lines.join("\n");
}

/* 工具定義：AI 可以調用的平台功能 */
export const COMPANION_TOOLS = {
  goto_page: {
    desc: "導航到指定頁面。page 可選：review(複習), knowledge(曙光寶庫), socratic(蘇格拉底對話), feynman(費曼), quiz(對戰), universe(宇宙), island(群島), pet(靈獸), bookshelf(書架)。若 page 是 knowledge，可加 cat 參數直接進入特定分類的庫（例如 cat=\"物理\"）",
    exec: (args) => {
      const map = { review: "review.html", knowledge: "knowledge.html", socratic: "socratic.html", feynman: "feynman.html", quiz: "quiz.html", universe: "universe.html", island: "island.html", pet: "pet.html", bookshelf: "bookshelf.html" };
      let target = map[args.page] || "dashboard.html";
      // 曙光寶庫支援直接跳入特定分類（用絕對路徑避免相對路徑問題）
      if (args.page === "knowledge" && args.cat) {
        target = `/pages/knowledge.html?cat=${encodeURIComponent(args.cat)}`;
      } else {
        // 其他頁面也用絕對路徑
        target = `/pages/${target}`;
      }
      COMPANION_TOOLS.goto_page._navTarget = target;
      const friendly = args.page === "knowledge" && args.cat ? `${args.cat}庫` :
        { review: "複習頁", knowledge: "曙光寶庫", socratic: "蘇格拉底對話", feynman: "費曼", quiz: "對戰", universe: "宇宙", island: "群島", pet: "靈獸", bookshelf: "書架" }[args.page] || "主控台";
      return `正在前往${friendly}`;
    }
  },
  start_socratic: {
    desc: "為用戶開啟一場蘇格拉底對話。topic 為對話主題，會自動帶入對話頁",
    exec: (args) => {
      try { sessionStorage.setItem("socratic_topic", args.topic || ""); } catch {}
      // 同頁導航（window.open 會被擋彈窗）
      COMPANION_TOOLS.start_socratic._navTarget = "/pages/socratic.html";
      return `已為你準備好「${args.topic}」的蘇格拉底對話`;
    }
  },
  review_nudge: {
    desc: "提醒用戶去複習。會導航到複習頁",
    exec: () => { COMPANION_TOOLS.review_nudge._navTarget = "/pages/review.html"; return "正在前往複習頁"; }
  },
};

export function toolDescriptions() {
  return Object.entries(COMPANION_TOOLS)
    .map(([name, t]) => `- ${name}：${t.desc}`)
    .join("\n");
}

/* 解析 AI 回覆中的工具調用：格式 [TOOL:tool_name key="value"] */
export function parseToolCalls(text) {
  const calls = [];
  const re = /\[TOOL:(\w+)((?:\s+\w+="[^"]*")*)\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const args = {};
    const argRe = /(\w+)="([^"]*)"/g;
    let am;
    while ((am = argRe.exec(m[2])) !== null) args[am[1]] = am[2];
    calls.push({ tool: m[1], args, raw: m[0] });
  }
  return calls;
}

export async function execToolCall(call) {
  const tool = COMPANION_TOOLS[call.tool];
  if (!tool) return `未知工具：${call.tool}`;
  try {
    return await tool.exec(call.args);
  } catch (e) {
    return `工具執行失敗：${e.message}`;
  }
}

/* 小曙的 system prompt */
export function companionSystemPrompt(learningContext, nickname = "同學", memory = "") {
  const timeGreet = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return "早安";
    if (h >= 11 && h < 14) return "午安";
    if (h >= 14 && h < 18) return "下午好";
    return "晚安";
  })();
  return `你是「小曙」，曙光學習平台的個人學習管家 AI。用繁體中文，像朋友一樣親切對話。
現在是${timeGreet}時段，跟用戶打招呼時要自然帶入（例如「早安」）。

用戶的暱稱是「${nickname}」，對話中要親切地叫他，不要叫「同學」或「用戶」。

你是他的專屬學習管家，負責管理他的整個學習循環：
曙光寶庫（累積）→ 情境式學習（體驗思考）→ 知識對戰（檢驗成果）→ 複習（鞏固）→ 街機遊戲（樂趣）

你會：
- 主動問候，關心今日學習目標的進度
- 根據學習狀態推薦：該去寶庫的哪個分類、該體驗哪個情境、該複習什麼
- 提醒到期複習（FSRS），叮囑學習計畫
- 幫用戶建立學習計畫、安排複習進度
- 不直接給答案，用蘇格拉底式引導讓用戶自己想通

用戶目前的學習狀態：
${learningContext}
${memory ? `\n你記得關於他的事：\n${memory}\n（對話中可以自然提起，表示你記得他）` : ""}

你可以調用以下工具來幫助用戶。當你想用工具時，必須在回覆中插入 [TOOL:工具名 參數="值"]，例如 [TOOL:goto_page page="review"]。工具執行結果會再餵給你，你再回覆用戶。

重要：當用戶想去某個功能（如複習、對話、曙光寶庫），不要只用說的，一定要調用對應工具幫他跳轉。

絕對不要在回覆中顯示原始 URL、檔案路徑或內部動作註記（如「（正在前往xxx.html）」）。工具會自動處理跳轉，你只需要用自然的語言告訴用戶，例如「正在帶你去物理庫看看」。

範例：
- 用戶說「我想複習」→ 回覆「好，我們去複習！[TOOL:review_nudge]」
- 用戶說「我想學光合作用」→ 回覆「來，我們用蘇格拉底對話搞懂它！[TOOL:start_socratic topic="光合作用"]」
- 用戶說「帶我去曙光寶庫」→ 回覆「走！[TOOL:goto_page page="knowledge"]」
- 用戶說「帶我去物理庫」→ 回覆「走，去物理庫！[TOOL:goto_page page="knowledge" cat="物理"]」
- 用戶說「我想看數學的庫」→ 回覆「來！[TOOL:goto_page page="knowledge" cat="數學"]」

可用工具：
${toolDescriptions()}

規則：
1. 簡短親切，一次不要講太多（150 字內）
2. 主動但不囉嗦，建議要具體
3. 用戶想偷懶要答案時，溫和地引導他自己想
4. 提到具體行動時，直接調用工具幫他執行，不只用說的
5. 推薦寶庫分類時，只能推薦「現有寶庫分類」列表中的名稱，絕對不能編造不存在的庫名
6. 如果現有分類是「（尚無任何分類）」，要誠實說還沒有建立任何寶庫分類，引導用戶先建立，而不是假裝有

HTML 圖解能力：
當用戶點擊「HTML 解釋」按鈕（或要求用 HTML/圖解說明）時，你可以用 [HTML]...[/HTML] 包住一段完整的 HTML 來回答。
HTML 會在沙盒 iframe 中渲染（無 script 執行權限），所以只用 HTML+CSS，不要寫 <script>。
適合用 HTML 的場景：多概念比較（表格）、流程步驟（編號區塊）、時間線、分類架構、公式推導。
HTML 要自包含樣式（inline style），深色背景適配（平台是深夜圖書館風），字體大小適中。
範例：
用戶問「比較牛頓三定律」→ 你回覆 [HTML]<div style="...">...表格比較三定律...</div>[/HTML]
記住：只在用戶明確要求 HTML 解釋時用，平常對話保持純文字簡短。`;
}

/* 帶工具調用的完整對話流程 */
export async function companionChat(messages, learningContext, onUpdate, nickname = "同學", memory = "") {
  const system = companionSystemPrompt(learningContext, nickname, memory);
  const full = [{ role: "system", content: system }, ...messages];

  let reply = await chat(full, { model: MODELS.chat, max_tokens: 1500 });
  if (!reply?.trim()) throw new Error("AI 沒有回應");

  // 執行工具調用
  const calls = parseToolCalls(reply);
  // 把工具標記從顯示文字中移除
  let displayText = reply.replace(/\[TOOL:\w+(?:\s+\w+="[^"]*")*\]/g, "").trim();

  for (const call of calls) {
    const result = await execToolCall(call);
    onUpdate?.(call, result);
    // 導航類工具：顯示訊息後延遲跳轉，不再調用 AI（避免跳頁中斷）
    const navTools = ["goto_page", "review_nudge", "start_socratic"];
    if (navTools.includes(call.tool)) {
      // 導航時不顯示內部註記，只保留 AI 的自然語言
      if (!displayText) displayText = "正在帶你過去…";
      // 立即跳轉（存 target 避免閉包問題）
      const navTarget = COMPANION_TOOLS[call.tool]?._navTarget;
      if (navTarget) {
        // 跳轉後目標頁預設自動開啟懸浮 AI 對話窗
        try { sessionStorage.setItem("fc_auto_open", "1"); } catch {}
        setTimeout(() => { location.href = navTarget; }, 800);
      }
      continue;
    }
    // 非導航工具：把結果餵回 AI 做最終回覆
    const followUp = await chat(
      [...full, { role: "assistant", content: reply }, { role: "user", content: `工具 ${call.tool} 執行結果：${result}。請簡短回覆用戶。` }],
      { model: MODELS.chat, max_tokens: 500 }
    );
    if (followUp?.trim()) displayText = followUp.trim();
  }

  return displayText;
}

/* 開場主動建議：根據學習狀態生成一句話 */
export async function companionGreeting(learningContext, nickname = "同學") {
  const h = new Date().getHours();
  const greet = h >= 5 && h < 11 ? "早安" : h >= 11 && h < 14 ? "午安" : h >= 14 && h < 18 ? "下午好" : "晚上好";
  const fallback = `${greet}，${nickname}！今天想學點什麼？我陪你！`;
  try {
    const reply = await chat([
      { role: "system", content: `你是「小曙」，AI 學習陪伴者。用繁體中文，親切簡短（80 字內）。現在是${greet}時段，開頭一定要用「${greet}，${nickname}」打招呼。根據用戶學習狀態，主動給一句今日建議或關心。不要調用工具，只要一句話。要像朋友一樣溫暖。` },
      { role: "user", content: `我的學習狀態：\n${learningContext}\n請給我一句今日建議。` },
    ], { model: MODELS.fast, max_tokens: 300 });
    return reply?.trim() || fallback;
  } catch {
    return fallback;
  }
}
