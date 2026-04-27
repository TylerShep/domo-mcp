import {
  type DomoMcpConfig,
  hasBrowserCredentials,
  hasDeveloperToken,
  hasOAuthCredentials,
} from "../config.js";
import type { AuthStrategy, DomoHost } from "../types/domo.js";
import { type BrowserSession, BrowserSessionManager } from "./browser.js";
import { DeveloperTokenManager } from "./developerToken.js";
import { OAuthTokenManager } from "./oauth.js";

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export interface RequestAuth {
  headers: Record<string, string>;
  cookies?: Record<string, string>;
  strategy: AuthStrategy;
}

/**
 * Resolves which auth strategy to use for a given host.
 *
 *  - "platform" (api.domo.com)  -> OAuth bearer (only mode that works)
 *  - "instance" ({inst}.domo.com) -> developer token preferred, then OAuth bearer,
 *                                    then browser session (if configured)
 *
 * Throws AuthRequiredError with a clear, actionable message when the requested
 * host can't be served with the configured credentials.
 */
export class AuthManager {
  private readonly oauth: OAuthTokenManager | null;
  private readonly devToken: DeveloperTokenManager | null;
  private readonly browser: BrowserSessionManager | null;

  constructor(private readonly config: DomoMcpConfig) {
    this.oauth = hasOAuthCredentials(config)
      ? new OAuthTokenManager({
          clientId: config.domoClientId as string,
          clientSecret: config.domoClientSecret as string,
          apiHost: config.domoApiHost,
        })
      : null;

    this.devToken =
      hasDeveloperToken(config) && config.domoDeveloperToken && config.domoInstance
        ? new DeveloperTokenManager({
            instance: config.domoInstance,
            developerToken: config.domoDeveloperToken,
          })
        : null;

    this.browser =
      hasBrowserCredentials(config) && config.domoInstance
        ? new BrowserSessionManager({
            instance: config.domoInstance,
            username: config.domoUsername,
            password: config.domoPassword,
          })
        : null;
  }

  get available(): { developerToken: boolean; oauth: boolean; browser: boolean } {
    return {
      developerToken: this.devToken !== null,
      oauth: this.oauth !== null,
      browser: this.browser !== null,
    };
  }

  hasInstance(): boolean {
    return Boolean(this.config.domoInstance);
  }

  async authForPlatform(): Promise<RequestAuth> {
    if (!this.oauth) {
      throw new AuthRequiredError(
        "This Domo API requires OAuth credentials. Set DOMO_CLIENT_ID and DOMO_CLIENT_SECRET in your MCP config. " +
          "Create them at https://developer.domo.com/portal under Custom Apps.",
      );
    }
    const token = await this.oauth.getToken();
    return {
      headers: { Authorization: `Bearer ${token}` },
      strategy: "oauth-bearer",
    };
  }

  async authForInstance(): Promise<RequestAuth> {
    if (!this.hasInstance()) {
      throw new AuthRequiredError(
        "This Domo API requires DOMO_INSTANCE (your Domo subdomain, e.g. 'acme' for acme.domo.com).",
      );
    }
    if (this.devToken) {
      return { headers: this.devToken.headers(), strategy: "developer-token" };
    }
    if (this.oauth) {
      const token = await this.oauth.getToken();
      return {
        headers: { Authorization: `Bearer ${token}` },
        strategy: "oauth-bearer",
      };
    }
    if (this.browser) {
      const session = await this.browser.getSession();
      return {
        headers: {},
        cookies: session.cookies,
        strategy: "browser-session",
      };
    }
    throw new AuthRequiredError(
      "This Domo instance API requires DOMO_DEVELOPER_TOKEN (preferred) or DOMO_CLIENT_ID + DOMO_CLIENT_SECRET, " +
        "or browser fallback credentials. Set them in your MCP config.",
    );
  }

  async authForHost(host: DomoHost): Promise<RequestAuth> {
    return host === "platform" ? this.authForPlatform() : this.authForInstance();
  }

  invalidateOAuth(): void {
    this.oauth?.invalidate();
  }

  invalidateBrowser(): void {
    this.browser?.invalidate();
  }

  async resolveBrowserSession(): Promise<BrowserSession | null> {
    if (!this.browser) return null;
    return this.browser.getSession();
  }
}
