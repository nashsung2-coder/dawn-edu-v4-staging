/* v4 核心：LLM 直連 Worker（Groq） */
const WORKER_URL = "https://dawn-llm-proxy.nashsung2.workers.dev";

/* OpenRouter 模型配置：不同功能用不同模型
 * 主力 OpenRouter（中文強、便宜），Groq 當備援 */
export const MODELS = {
  // 推理型：費曼評估、深度分析（DeepSeek R1，想得最深）
  reason: "deepseek/deepseek-r1",
  // 蘇格拉底追問：中文犀利、反應快
  socratic: "deepseek/deepseek-chat",
  // 通用型：AI 潤飾、發布審核（Qwen 中文寫作最自然）
  chat: "qwen/qwen-2.5-72b-instruct",
  // 知識對戰出題：便宜量大
  battle: "deepseek/deepseek-chat",
  // 極速型：簡單分類、推薦
  fast: "deepseek/deepseek-chat",
};

export async function chat(messages, opts = {}) {
  const maxRetries = opts.retries ?? 2;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
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
      if (!res.ok) throw new Error(`AI 服務暫時無法使用（${res.status}）`);
      const data = await res.json();
      let content = data.choices?.[0]?.message?.content || "";
      // DeepSeek R1 推理模型會在 <think> 標籤放思考過程，只取最終答案
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (!content) throw new Error("AI 回傳了空內容");
      return content;
    } catch (e) {
      lastErr = e;
      // 最後一次不重試；AbortError（超時）也重試
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

export async function ask(system, user, opts = {}) {
  return chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    opts
  );
}
