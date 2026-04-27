import type { AIProvider, ChatCompletionOptions } from "../gateway.js";
import { ensureKey } from "../gateway.js";

export interface GeminiProviderOptions {
  apiKey: string | undefined;
  model?: string | undefined;
}

const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";

export function makeGeminiProvider(opts: GeminiProviderOptions): AIProvider {
  const apiKey = ensureKey(opts.apiKey, "GEMINI_API_KEY", "gemini");
  const defaultModel = opts.model ?? GEMINI_DEFAULT_MODEL;

  return {
    name: "gemini",
    defaultModel,
    async chatCompletion(req: ChatCompletionOptions): Promise<string> {
      const model = req.model ?? defaultModel;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const body = {
        systemInstruction: { role: "system", parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 4000,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "<unreadable>");
        throw new Error(
          `Gemini chat completion failed (${response.status}): ${text.slice(0, 500)}`,
        );
      }
      const json = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) {
        throw new Error(
          `Gemini response missing text content: ${JSON.stringify(json).slice(0, 500)}`,
        );
      }
      return text;
    },
  };
}
