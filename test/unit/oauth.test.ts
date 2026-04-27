import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { OAuthError, OAuthTokenManager } from "../../src/auth/oauth.js";
import { use } from "../setup.js";

describe("OAuthTokenManager", () => {
  it("returns the access token from a successful exchange", async () => {
    use(
      http.get("https://api.domo.com/oauth/token", () =>
        HttpResponse.json({ access_token: "tok-abc", expires_in: 3600 }),
      ),
    );
    const mgr = new OAuthTokenManager({
      clientId: "client",
      clientSecret: "secret",
      apiHost: "api.domo.com",
    });
    expect(await mgr.getToken()).toBe("tok-abc");
  });

  it("caches the token across calls", async () => {
    let calls = 0;
    use(
      http.get("https://api.domo.com/oauth/token", () => {
        calls++;
        return HttpResponse.json({ access_token: "cached", expires_in: 3600 });
      }),
    );
    const mgr = new OAuthTokenManager({
      clientId: "c",
      clientSecret: "s",
      apiHost: "api.domo.com",
    });
    await mgr.getToken();
    await mgr.getToken();
    expect(calls).toBe(1);
  });

  it("falls back to scope=data when wide scopes are rejected", async () => {
    let attempts = 0;
    use(
      http.get("https://api.domo.com/oauth/token", ({ request }) => {
        attempts++;
        const url = new URL(request.url);
        const scope = url.searchParams.get("scope") ?? "";
        if (scope.includes("dashboard")) {
          return new HttpResponse("invalid_scope", { status: 400 });
        }
        if (scope === "data") {
          return HttpResponse.json({ access_token: "narrow", expires_in: 1000 });
        }
        return new HttpResponse("nope", { status: 400 });
      }),
    );
    const mgr = new OAuthTokenManager({
      clientId: "c",
      clientSecret: "s",
      apiHost: "api.domo.com",
    });
    expect(await mgr.getToken()).toBe("narrow");
    expect(attempts).toBe(2);
  });

  it("throws OAuthError on a 401 response", async () => {
    use(
      http.get(
        "https://api.domo.com/oauth/token",
        () => new HttpResponse("bad creds", { status: 401 }),
      ),
    );
    const mgr = new OAuthTokenManager({
      clientId: "c",
      clientSecret: "s",
      apiHost: "api.domo.com",
    });
    await expect(mgr.getToken()).rejects.toBeInstanceOf(OAuthError);
  });

  it("invalidate clears the cache", async () => {
    let calls = 0;
    use(
      http.get("https://api.domo.com/oauth/token", () => {
        calls++;
        return HttpResponse.json({ access_token: `tok-${calls}`, expires_in: 3600 });
      }),
    );
    const mgr = new OAuthTokenManager({
      clientId: "c",
      clientSecret: "s",
      apiHost: "api.domo.com",
    });
    expect(await mgr.getToken()).toBe("tok-1");
    mgr.invalidate();
    expect(await mgr.getToken()).toBe("tok-2");
  });

  it("uses the correct authorization basic header", async () => {
    let receivedAuth: string | null = null;
    use(
      http.get("https://api.domo.com/oauth/token", ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json({ access_token: "ok", expires_in: 60 });
      }),
    );
    const mgr = new OAuthTokenManager({
      clientId: "alice",
      clientSecret: "secr3t",
      apiHost: "api.domo.com",
    });
    await mgr.getToken();
    const expected = `Basic ${Buffer.from("alice:secr3t").toString("base64")}`;
    expect(receivedAuth).toBe(expected);
    vi.clearAllMocks();
  });
});
