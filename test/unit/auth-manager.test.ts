import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { AuthManager, AuthRequiredError } from "../../src/auth/manager.js";
import { buildTestConfig } from "../helpers.js";
import { use } from "../setup.js";

describe("AuthManager", () => {
  it("reports which strategies are configured", () => {
    const cfg = buildTestConfig({
      domoDeveloperToken: "dev",
      domoInstance: "test",
    });
    const m = new AuthManager(cfg);
    expect(m.available).toEqual({
      developerToken: true,
      oauth: true,
      browser: false,
    });
  });

  it("uses OAuth bearer for platform host", async () => {
    use(
      http.get("https://api.domo.com/oauth/token", () =>
        HttpResponse.json({ access_token: "tok-xyz", expires_in: 3600 }),
      ),
    );
    const m = new AuthManager(buildTestConfig());
    const auth = await m.authForPlatform();
    expect(auth.strategy).toBe("oauth-bearer");
    expect(auth.headers.Authorization).toBe("Bearer tok-xyz");
  });

  it("prefers developer token for instance host when both are configured", async () => {
    const m = new AuthManager(
      buildTestConfig({
        domoDeveloperToken: "dev-tok",
        domoInstance: "acme",
      }),
    );
    const auth = await m.authForInstance();
    expect(auth.strategy).toBe("developer-token");
    expect(auth.headers["X-DOMO-Developer-Token"]).toBe("dev-tok");
  });

  it("falls back to OAuth on instance host when no dev token", async () => {
    use(
      http.get("https://api.domo.com/oauth/token", () =>
        HttpResponse.json({ access_token: "fall-back", expires_in: 3600 }),
      ),
    );
    const m = new AuthManager(
      buildTestConfig({
        domoInstance: "acme",
      }),
    );
    const auth = await m.authForInstance();
    expect(auth.strategy).toBe("oauth-bearer");
    expect(auth.headers.Authorization).toBe("Bearer fall-back");
  });

  it("throws AuthRequiredError when no platform credentials are configured", async () => {
    const m = new AuthManager(
      buildTestConfig({
        domoClientId: undefined,
        domoClientSecret: undefined,
        domoDeveloperToken: "dev-only",
        domoInstance: "acme",
      }),
    );
    await expect(m.authForPlatform()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("throws AuthRequiredError on instance host when no instance is set", async () => {
    const m = new AuthManager(
      buildTestConfig({
        domoInstance: undefined,
      }),
    );
    await expect(m.authForInstance()).rejects.toBeInstanceOf(AuthRequiredError);
  });
});
