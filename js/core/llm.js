/* v4 核心：LLM 直連 Worker（Groq） */
const WORKER_URL = "https://dawn-llm-proxy.nashsung2.workers.dev";

/* Groq 模型配置：不同功能用不同模型 */
export const MODELS = {
  // 推理型：費曼評估、蘇格拉底追問、深度分析（慢但想得深）
  reason: "deepseek-r1-distill-llama-70b",
  // 通用型：AI 潤飾、發布審核、知識對戰（平衡）
  chat: "llama-3.3-70b-versatile",
  // 極速型：簡單分類、推薦、標題生成（快）
  fast: "llama-3.1-8b-instant",
};

export async function chat(messages, opts = {}) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model: opts.model || MODELS.chat,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens || 2000,
    }),
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || "";
  // DeepSeek R1 推理模型會在 <think> 標籤放思考過程，只取最終答案
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return content;
}

export async function ask(system, user, opts = {}) {
  return chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    opts
  );
}
