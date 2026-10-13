/* v4 核心：LLM 直連 Worker */
const WORKER_URL = "https://dawn-llm-proxy.nashsung2.workers.dev";

export async function chat(messages, opts = {}) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model: opts.model || "openai/gpt-oss-20b",
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens || 2000,
    }),
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function ask(system, user, opts = {}) {
  return chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    opts
  );
}
