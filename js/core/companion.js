/* 曙光教育 — AI 學習陪伴者「小曙」核心
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
    desc: "導航到指定頁面。page 可選：review(複習), knowledge(知識庫), socratic(蘇格拉底對話), feynman(費曼), quiz(對戰), universe(宇宙), island(群島), pet(靈獸), bookshelf(書架)",
    exec: (args) => {
      const map = { review: "review.html", knowledge: "knowledge.html", socratic: "socratic.html", feynman: "feynman.html", quiz: "quiz.html", universe: "universe.html", island: "island.html", pet: "pet.html", bookshelf: "bookshelf.html" };
      const target = map[args.page] || "dashboard.html";
      COMPANION_TOOLS.goto_page._navTarget = target;
      return `正在前往${target}`;
    }
  },
  start_socratic: {
    desc: "為用戶開啟一場蘇格拉底對話。topic 為對話主題，會自動帶入對話頁",
    exec: (args) => {
      try { sessionStorage.setItem("socratic_topic", args.topic || ""); } catch {}
      // 同頁導航（window.open 會被擋彈窗）
      COMPANION_TOOLS.start_socratic._navTarget = "socratic.html";
      return `已為你準備好「${args.topic}」的蘇格拉底對話`;
    }
  },
  review_nudge: {
    desc: "提醒用戶去複習。會導航到複習頁",
    exec: () => { COMPANION_TOOLS.review_nudge._navTarget = "review.html"; return "正在前往複習頁"; }
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
export function companionSystemPrompt(learningContext) {
  return `你是「小曙」，曙光教育平台的 AI 學習陪伴者。用繁體中文，像朋友一樣親切對話。

你的角色不是問答機器，是學習夥伴。你會：
- 主動關心學習進度，提醒到期複習
- 根據學習狀態推薦合適的知識庫或學習方式
- 幫用戶建立學習計畫、安排複習
- 不直接給答案，用引導讓用戶自己想通

用戶目前的學習狀態：
${learningContext}

你可以調用以下工具來幫助用戶。當你想用工具時，必須在回覆中插入 [TOOL:工具名 參數="值"]，例如 [TOOL:goto_page page="review"]。工具執行結果會再餵給你，你再回覆用戶。

重要：當用戶想去某個功能（如複習、對話、知識庫），不要只用說的，一定要調用對應工具幫他跳轉。

範例：
- 用戶說「我想複習」→ 回覆「好，我們去複習！[TOOL:review_nudge]」
- 用戶說「我想學光合作用」→ 回覆「來，我們用蘇格拉底對話搞懂它！[TOOL:start_socratic topic="光合作用"]」
- 用戶說「帶我去知識庫」→ 回覆「走！[TOOL:goto_page page="knowledge"]」

可用工具：
${toolDescriptions()}

規則：
1. 簡短親切，一次不要講太多（150 字內）
2. 主動但不囉嗦，建議要具體
3. 用戶想偷懶要答案時，溫和地引導他自己想
4. 提到具體行動時，直接調用工具幫他執行，不只用說的`;
}

/* 帶工具調用的完整對話流程 */
export async function companionChat(messages, learningContext, onUpdate) {
  const system = companionSystemPrompt(learningContext);
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
      displayText = (displayText ? displayText + "\n" : "") + `（${result}）`;
      // 延遲 1.5 秒讓用戶看到訊息再跳轉
      setTimeout(() => {
        const tool = COMPANION_TOOLS[call.tool];
        if (tool && tool._navTarget) location.href = tool._navTarget;
      }, 1500);
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
export async function companionGreeting(learningContext) {
  try {
    const reply = await chat([
      { role: "system", content: `你是「小曙」，AI 學習陪伴者。用繁體中文，親切簡短（80 字內）。根據用戶學習狀態，主動給一句今日建議或關心。不要調用工具，只要一句話。` },
      { role: "user", content: `我的學習狀態：\n${learningContext}\n請給我一句今日建議。` },
    ], { model: MODELS.fast, max_tokens: 300 });
    return reply?.trim() || "今天想學點什麼？我陪你！";
  } catch {
    return "今天想學點什麼？我陪你！";
  }
}
