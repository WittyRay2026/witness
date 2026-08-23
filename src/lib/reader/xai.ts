export const XAI_BASE = "https://api.x.ai/v1";
export const CHAT_MODEL = "grok-4.5";
export const VISION_MODEL = "grok-4.5";
export const RESEARCH_MODEL = "grok-4.6";
export function xaiKey(): string | null { return process.env.XAI_API_KEY || null; }
export function assertXai(): string {
  const k = xaiKey();
  if (!k) throw new Error("AI 在此环境不可用（缺少 XAI_API_KEY）");
  return k;
}
export async function chatText(messages: { role: "system" | "user" | "assistant"; content: unknown }[], opts: { maxTokens?: number; temperature?: number; model?: string } = {}): Promise<string> {
  const key = assertXai();
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: opts.model ?? CHAT_MODEL, messages, max_tokens: opts.maxTokens ?? 2500, temperature: opts.temperature ?? 0.2 }),
  });
  if (!res.ok) throw new Error(`xAI chat ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}
export async function chatJson<T>(messages: { role: "system" | "user" | "assistant"; content: unknown }[], opts: { maxTokens?: number; model?: string } = {}): Promise<T> {
  return parseJsonLoose<T>(await chatText(messages, opts));
}
export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? trimmed;
  const start = raw.search(/[\[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw) as T;
}
export async function transcribeAudio(file: Blob, filename = "audio.mp3"): Promise<{ text: string; language?: string; duration?: number; words?: { text: string; start: number; end: number }[] }> {
  const key = assertXai();
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${XAI_BASE}/stt`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`xAI STT ${res.status}: ${(await res.text()).slice(0, 240)}`);
  return (await res.json()) as { text: string; language?: string; duration?: number; words?: { text: string; start: number; end: number }[] };
}
export async function researchWithSearch(prompt: string): Promise<string> {
  const key = assertXai();
  const res = await fetch(`${XAI_BASE}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: RESEARCH_MODEL, input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], tools: [{ type: "web_search" }] }),
  });
  if (!res.ok) throw new Error(`xAI research ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data = (await res.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[]; choices?: { message?: { content?: string } }[] };
  if (data.output_text) return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output ?? []) for (const c of item.content ?? []) if (c.text) chunks.push(c.text);
  return chunks.join("\n") || data.choices?.[0]?.message?.content || "";
}
