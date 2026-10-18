/* 書架儲存共用：所有學習功能完成後，AI 整理存入書架 */
import { ask, MODELS } from "./llm.js";

/**
 * AI 整理學習成果並存入書架
 * @param {object} supabase
 * @param {string} userId
 * @param {object} opts { source: '思辨對話'|'知識對戰'|'情境學習'|'AI閱讀', topic, content, link }
 */
export async function saveToBookshelf(supabase, userId, opts) {
  const { source, topic, content, link } = opts;
  try {
    // AI 生成整理摘要
    const summary = await ask(
      `你是學習整理助手。用繁體中文，把學生的學習內容整理成書架條目。
輸出 JSON：{"title":"條目標題","summary":"150字內的學習重點摘要","key_points":["重點1","重點2","重點3"]}
只輸出 JSON。`,
      `來源：${source}\n主題：${topic}\n\n學習內容：\n${content.slice(0, 3000)}`,
      { model: MODELS.fast }
    );
    let parsed;
    try {
      parsed = JSON.parse(summary);
    } catch {
      const m = summary.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { title: topic, summary: content.slice(0, 150), key_points: [] };
    }
    await supabase.from("textbook_entries").insert({
      user_id: userId,
      topic,
      title: parsed.title || topic,
      user_voice_summary: parsed.summary,
      ai_supplement: `來源：${source}${link ? `\n連結：${link}` : ""}`,
      key_points: parsed.key_points || [],
    });
    return true;
  } catch (e) {
    console.warn("存入書架失敗:", e.message);
    return false;
  }
}
