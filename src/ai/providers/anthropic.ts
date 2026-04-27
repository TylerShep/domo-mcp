import type { AIProvider, ChatCompletionOptions } from "../gateway.js";
import { ensureKey } from "../gateway.js";

export interface AnthropicProviderOptions {
  apiKey: string | undefined;
  model?: string | undefined;
}

const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-sonnet-latest";
const ANTHROPIC_API_VERSION = "2023-06-01";

export function makeAnthropicProvider(opts: AnthropicProviderOptions): AIProvider {
  const apiKey = ensureKey(opts.apiKey, "ANTHROPIC_API_KEY", "anthropic");
  const defaultModel = opts.model ?? ANTHROPIC_DEFAULT_MODEL;

  return {
    name: "anthropic",
    defaultModel,
    async chatCompletion(req: ChatCompletionOptions): Promise<string> {
      const model = req.model ?? defaultModel;
      const body = {
        model,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        max_tokens: req.maxTokens ?? 4000,
        temperature: req.temperature ?? 0.3,
      };

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "<unreadable>");
        throw new Error(
          `Anthropic chat completion failed (${response.status}): ${text.slice(0, 500)}`,
        );
      }
      const json = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = json.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      if (!text) {
        throw new Error(
          `Anthropic response missing text content: ${JSON.stringify(json).slice(0, 500)}`,
        );
      }
      return text;
    },
  };
}
