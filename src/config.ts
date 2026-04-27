import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const ConfigSchema = z.object({
  domoInstance: z.string().min(1).optional(),
  domoDeveloperToken: z.string().min(1).optional(),
  domoClientId: z.string().min(1).optional(),
  domoClientSecret: z.string().min(1).optional(),
  domoUsername: z.string().min(1).optional(),
  domoPassword: z.string().min(1).optional(),
  domoApiHost: z.string().default("api.domo.com"),
  domoTimeoutMs: z.number().int().positive().default(60_000),
  domoMaxRetries: z.number().int().nonnegative().default(3),
  domoDatasetsMetaDatasetId: z.string().min(1).optional(),
  domoCardsMetaDatasetId: z.string().min(1).optional(),
  aiProvider: z.enum(["openai", "anthropic", "gemini", "grok"]).optional(),
  openaiApiKey: z.string().min(1).optional(),
  openaiBaseUrl: z.string().url().optional(),
  anthropicApiKey: z.string().min(1).optional(),
  geminiApiKey: z.string().min(1).optional(),
  grokApiKey: z.string().min(1).optional(),
  aiModel: z.string().min(1).optional(),
  logLevel: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type DomoMcpConfig = z.infer<typeof ConfigSchema>;

function parseInt32(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DomoMcpConfig {
  const parsed = ConfigSchema.parse({
    domoInstance: env.DOMO_INSTANCE,
    domoDeveloperToken: env.DOMO_DEVELOPER_TOKEN,
    domoClientId: env.DOMO_CLIENT_ID,
    domoClientSecret: env.DOMO_CLIENT_SECRET,
    domoUsername: env.DOMO_USERNAME,
    domoPassword: env.DOMO_PASSWORD,
    domoApiHost: env.DOMO_API_HOST || "api.domo.com",
    domoTimeoutMs: parseInt32(env.DOMO_TIMEOUT_MS, 60_000),
    domoMaxRetries: parseInt32(env.DOMO_MAX_RETRIES, 3),
    domoDatasetsMetaDatasetId: env.DOMO_DATASETS_META_DATASET_ID,
    domoCardsMetaDatasetId: env.DOMO_CARDS_META_DATASET_ID,
    aiProvider: env.AI_PROVIDER as DomoMcpConfig["aiProvider"],
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    grokApiKey: env.GROK_API_KEY,
    aiModel: env.AI_MODEL,
    logLevel: (env.LOG_LEVEL as DomoMcpConfig["logLevel"]) || "info",
  });

  if (!hasAnyAuth(parsed)) {
    throw new Error(
      "domo-mcp: no Domo credentials configured. Set DOMO_DEVELOPER_TOKEN + DOMO_INSTANCE, " +
        "or DOMO_CLIENT_ID + DOMO_CLIENT_SECRET, in your MCP host's env config.",
    );
  }
  return parsed;
}

export function hasDeveloperToken(c: DomoMcpConfig): boolean {
  return Boolean(c.domoDeveloperToken && c.domoInstance);
}

export function hasOAuthCredentials(c: DomoMcpConfig): boolean {
  return Boolean(c.domoClientId && c.domoClientSecret);
}

export function hasBrowserCredentials(c: DomoMcpConfig): boolean {
  return Boolean(c.domoUsername && c.domoPassword && c.domoInstance);
}

export function hasAnyAuth(c: DomoMcpConfig): boolean {
  return hasDeveloperToken(c) || hasOAuthCredentials(c) || hasBrowserCredentials(c);
}

export function instanceBaseUrl(c: DomoMcpConfig): string {
  if (!c.domoInstance) {
    throw new Error("DOMO_INSTANCE is required for instance-host APIs.");
  }
  return `https://${c.domoInstance}.domo.com`;
}

export function platformBaseUrl(c: DomoMcpConfig): string {
  const host = c.domoApiHost;
  return host.startsWith("http") ? host : `https://${host}`;
}
