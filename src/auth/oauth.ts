import { DomoOAuthTokenResponseSchema } from "../types/domo.js";

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  apiHost: string;
  scopes?: string[];
  fallbackScopes?: string[];
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * OAuth2 client_credentials token fetcher with in-memory caching and
 * scope-fallback (try a wide scope set first, fall back to "data" only).
 *
 * Ported from dsl-beast/auth.py and domo-slack-ext-reporting/app/engines/rest.py.
 */
export class OAuthTokenManager {
  private cache: CachedToken | null = null;

  constructor(private readonly creds: OAuthCredentials) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.cache.accessToken;
    }
    const token = await this.fetchToken();
    this.cache = token;
    return token.accessToken;
  }

  invalidate(): void {
    this.cache = null;
  }

  private async fetchToken(): Promise<CachedToken> {
    const wideScopes = this.creds.scopes ?? [
      "data",
      "user",
      "dashboard",
      "audit",
      "buzz",
      "workflow",
      "account",
    ];
    const fallback = this.creds.fallbackScopes ?? ["data"];

    try {
      return await this.exchangeCredentials(wideScopes);
    } catch (err) {
      if (err instanceof OAuthError && wideScopes.length !== fallback.length) {
        return await this.exchangeCredentials(fallback);
      }
      throw err;
    }
  }

  private async exchangeCredentials(scopes: string[]): Promise<CachedToken> {
    const url = this.tokenUrl();
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      scope: scopes.join(" "),
    });
    const basicAuth = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString(
      "base64",
    );

    let response: Response;
    try {
      response = await fetch(`${url}?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      });
    } catch (cause) {
      throw new OAuthError(
        `OAuth token request failed (network): ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new OAuthError(
        `OAuth token request failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }

    const json: unknown = await response.json();
    const parsed = DomoOAuthTokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new OAuthError(`OAuth response missing access_token: ${JSON.stringify(json)}`);
    }
    const expiresInMs = (parsed.data.expires_in ?? 3600) * 1000;
    return {
      accessToken: parsed.data.access_token,
      expiresAt: Date.now() + expiresInMs,
    };
  }

  private tokenUrl(): string {
    const host = this.creds.apiHost.startsWith("http")
      ? this.creds.apiHost
      : `https://${this.creds.apiHost}`;
    return `${host.replace(/\/$/, "")}/oauth/token`;
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable>";
  }
}
