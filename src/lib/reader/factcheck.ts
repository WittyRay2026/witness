import type { Claim, FactCheck, SourceHit, TimelineSegment, VideoMetadata } from "./types";
import { chatJson, researchWithSearch } from "./xai";
export async function resolveSources(opts: { framesSources: string[]; timeline: TimelineSegment[]; description: string }): Promise<SourceHit[]> {
  const mentioned = [...new Set([...opts.framesSources, ...opts.timeline.flatMap((s) => s.sources), ...(opts.description.match(/https?:\/\/[^\s)]+/g) ?? [])].map((s) => s.trim()).filter(Boolean))].slice(0, 16);
  if (!mentioned.length) return [];
  try {
    const result = await chatJson<{ sources: SourceHit[] }>([
      { role: "system", content: "Identify cited sources. Do not invent URLs." },
      { role: "user", content: `Mentions: ${JSON.stringify(mentioned)}\nReturn JSON { \"sources\": [{ \"id\": \"s1\", \"mentionedAs\": \"\", \"kind\": \"other\", \"status\": \"unresolved\" }] }` },
    ], { maxTokens: 1200 });
    return (result.sources ?? []).map((s, i) => ({ id: s.id || `s${i + 1}`, mentionedAs: s.mentionedAs, kind: s.kind || "other", resolvedUrl: s.resolvedUrl, resolvedTitle: s.resolvedTitle, supportsClaim: s.supportsClaim, status: s.status ?? "unresolved" }));
  } catch {
    return mentioned.map((m, i) => ({ id: `s${i + 1}`, mentionedAs: m, kind: "other", status: "unresolved" as const }));
  }
}
export async function verifyClaims(opts: { metadata: VideoMetadata; claims: Claim[] }): Promise<FactCheck[]> {
  const top = opts.claims.slice(0, 8);
  if (!top.length) return [];
  try {
    const result = await chatJson<{ checks: FactCheck[] }>([
      { role: "system", content: "Conservative fact checker. Mark unconfirmed unless established." },
      { role: "user", content: `Claims:\n${top.map((c, i) => `${i + 1}. ${c.text}`).join("\n")}\nReturn JSON { \"checks\": [{ \"id\": \"f1\", \"claim\": \"\", \"verdict\": \"unconfirmed\", \"sourcePriority\": \"secondary\", \"sources\": [], \"notes\": \"\" }] }` },
    ], { maxTokens: 1600 });
    return (result.checks ?? []).map((c, i) => ({ id: c.id || `f${i + 1}`, claim: c.claim ?? "", verdict: c.verdict === "supported" || c.verdict === "partial" || c.verdict === "unsupported" || c.verdict === "unconfirmed" ? c.verdict : "unconfirmed", sourcePriority: c.sourcePriority ?? "secondary", sources: Array.isArray(c.sources) ? c.sources : [], notes: c.notes ?? "" }));
  } catch {
    return top.map((c, i) => ({ id: `f${i + 1}`, claim: c.text, verdict: "unconfirmed" as const, sourcePriority: "secondary", sources: [], notes: "外部核验不可用。" }));
  }
}
void researchWithSearch;
