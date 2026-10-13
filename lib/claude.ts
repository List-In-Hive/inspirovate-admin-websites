import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { normalizedLink, type ArticleSource } from "./article-format";
import { getSite } from "./config";
export const claudeModel = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());
export function claudeClient() {
  if (!claudeConfigured()) throw new Error("Add ANTHROPIC_API_KEY to .env.local and restart the admin.");
  // Paid requests are never retried automatically; streaming keeps long articles under HTTP timeouts.
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 600000 });
}
export function claudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "Anthropic rejected the key. Check ANTHROPIC_API_KEY and restart the admin.";
  if (error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.NotFoundError) return "The key cannot access the selected Claude model. Check the Anthropic workspace and ANTHROPIC_MODEL.";
  if (error instanceof Anthropic.RateLimitError) return "Anthropic: the request or spending limit has been reached. Check Usage and Billing in the Claude Console.";
  if (error instanceof Error && error.message.startsWith("Claude ")) return error.message;
  return "Claude did not complete the request. Check the Claude Console logs before starting another request: the previous request may have been charged. It will not be retried automatically.";
}
// A clear refusal of service (bad key, quota, outage) means the other provider can take over.
// Timeouts are ambiguous: the request may still have been processed and charged.
export function claudeUnavailable(error: unknown) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return false;
  if (error instanceof Anthropic.APIConnectionError) return true;
  return error instanceof Anthropic.APIError && [401, 403, 404, 429, 500, 502, 503, 529].includes(error.status ?? 0);
}
export async function checkClaude() {
  try { await claudeClient().models.retrieve(claudeModel()); return true; }
  catch (e) { throw new Error(claudeError(e)); }
}
type ClaudeRequest<T extends z.ZodType> = { schema: T; system: string; user: string; effort?: "low" | "medium" | "high" | "xhigh"; webSearches?: number };
// Structured Claude request. Optional web search is the fallback research path when OpenAI is unavailable.
export async function claudeParse<T extends z.ZodType>({ schema, system, user, effort = "high", webSearches = 0 }: ClaudeRequest<T>) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  const sources: ArticleSource[] = []; const ids: string[] = []; let inputTokens = 0, outputTokens = 0;
  for (let turn = 0; turn < 4; turn++) {
    const message = await claudeClient().beta.messages.stream({
      model: claudeModel(), max_tokens: 32000, system, messages,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort, format: betaZodOutputFormat(schema) },
      ...(webSearches ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: webSearches }] } : {}),
    }).finalMessage();
    ids.push(message.id); inputTokens += message.usage.input_tokens; outputTokens += message.usage.output_tokens;
    for (const block of message.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) for (const result of block.content) addSource(sources, result.url, result.title);
      if (block.type === "text") for (const citation of block.citations || []) if (citation.type === "web_search_result_location") addSource(sources, citation.url, citation.title || citation.url);
    }
    if (message.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: message.content }); continue; }
    if (message.stop_reason === "refusal") throw new Error("Claude declined this request. Adjust the topic or instructions.");
    if (message.stop_reason === "max_tokens" || !message.parsed_output) throw new Error("Claude returned an incomplete response.");
    return { output: message.parsed_output as z.infer<T>, sources, responseId: ids.join(","), inputTokens, outputTokens };
  }
  throw new Error("Claude returned an incomplete response.");
}
function addSource(sources: ArticleSource[], value: string, title: string) {
  const url = normalizedLink(value, getSite().url);
  if (url.startsWith("https://") && !sources.some(s => s.url === url)) sources.push({ url, title });
}
