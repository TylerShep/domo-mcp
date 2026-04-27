import type { DomoMcpConfig } from "../config.js";
import { makeAnthropicProvider } from "./providers/anthropic.js";
import { makeGeminiProvider } from "./providers/gemini.js";
import { makeOpenAIProvider } from "./providers/openai.js";

export interface ChatCompletionOptions {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  chatCompletion(opts: ChatCompletionOptions): Promise<string>;
}

export class AINotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AINotConfiguredError";
  }
}

export function ensureKey(key: string | undefined, envName: string, providerName: string): string {
  if (!key) {
    throw new AINotConfiguredError(
      `${providerName} provider requires ${envName} to be set in your MCP config.`,
    );
  }
  return key;
}

export function buildAIProvider(config: DomoMcpConfig): AIProvider {
  const provider = config.aiProvider;
  if (!provider) {
    throw new AINotConfiguredError(
      "AI tools require AI_PROVIDER (one of: openai, anthropic, gemini, grok). Set it in your MCP config.",
    );
  }
  switch (provider) {
    case "openai":
      return makeOpenAIProvider({
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.aiModel,
      });
    case "anthropic":
      return makeAnthropicProvider({ apiKey: config.anthropicApiKey, model: config.aiModel });
    case "gemini":
      return makeGeminiProvider({ apiKey: config.geminiApiKey, model: config.aiModel });
    case "grok":
      return makeOpenAIProvider({
        apiKey: config.grokApiKey,
        baseUrl: "https://api.x.ai/v1",
        model: config.aiModel ?? "grok-2-latest",
        providerName: "grok",
        envKeyName: "GROK_API_KEY",
      });
    default: {
      const _: never = provider;
      throw new AINotConfiguredError(`Unknown AI_PROVIDER: ${String(_)}`);
    }
  }
}
