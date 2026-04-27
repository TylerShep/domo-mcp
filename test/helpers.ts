import { http, HttpResponse } from "msw";
import { AuthManager } from "../src/auth/manager.js";
import type { DomoMcpConfig } from "../src/config.js";
import { DomoClient } from "../src/domo/client.js";

export function buildTestConfig(overrides: Partial<DomoMcpConfig> = {}): DomoMcpConfig {
  return {
    domoInstance: "test",
    domoApiHost: "api.domo.com",
    domoTimeoutMs: 5_000,
    domoMaxRetries: 0,
    domoClientId: "client-id",
    domoClientSecret: "client-secret",
    logLevel: "silent",
    ...overrides,
  };
}

export function buildTestClient(config: Partial<DomoMcpConfig> = {}): {
  client: DomoClient;
  auth: AuthManager;
  config: DomoMcpConfig;
} {
  const cfg = buildTestConfig(config);
  const auth = new AuthManager(cfg);
  const client = new DomoClient(auth, cfg);
  return { client, auth, config: cfg };
}

/** Standard handler that hands out a valid OAuth token. */
export const oauthTokenHandler = http.get("https://api.domo.com/oauth/token", () =>
  HttpResponse.json({ access_token: "test-bearer", expires_in: 3600 }),
);
