import type { AIProvider, ChatCompletionOptions } from "../gateway.js";
import { ensureKey } from "../gateway.js";

export interface OpenAIProviderOptions {
  apiKey: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
  providerName?: string;
  envKeyName?: string;
  defaultModel?: string;
}

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

/**
 * OpenAI Chat Completions provider. Also used for any OpenAI-compatible
 * endpoint via `baseUrl` (e.g. xAI Grok, local Ollama, custom AI gateway).
 */
export function makeOpenAIProvider(opts: OpenAIProviderOptions): AIProvider {
  const providerName = opts.providerName ?? "openai";
  const envKey = opts.envKeyName ?? "OPENAI_API_KEY";
  const apiKey = ensureKey(opts.apiKey, envKey, providerName);
  const baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const defaultModel = opts.model ?? opts.defaultModel ?? OPENAI_DEFAULT_MODEL;

  return {
    name: providerName,
    defaultModel,
    async chatCompletion(req: ChatCompletionOptions): Promise<string> {
      const model = req.model ?? defaultModel;
      const body = {
        model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 4000,
      };

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "<unreadable>");
        throw new Error(
          `${providerName} chat completion failed (${response.status}): ${text.slice(0, 500)}`,
        );
      }
      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error(
          `${providerName} response missing message content: ${JSON.stringify(json).slice(0, 500)}`,
        );
      }
      return content;
    },
  };
}
