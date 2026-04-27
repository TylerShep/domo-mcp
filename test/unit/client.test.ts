import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { DomoApiError } from "../../src/domo/client.js";
import { buildTestClient, oauthTokenHandler } from "../helpers.js";
import { use } from "../setup.js";

describe("DomoClient", () => {
  it("sends bearer authorization on platform-host requests", async () => {
    let receivedAuth: string | null = null;
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/users/me", ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json({ id: 1, email: "a@b.com" });
      }),
    );
    const { client } = buildTestClient();
    const me = await client.request<{ id: number }>({
      host: "platform",
      path: "/v1/users/me",
    });
    expect(me.id).toBe(1);
    expect(receivedAuth).toBe("Bearer test-bearer");
  });

  it("uses developer token header on instance-host requests when available", async () => {
    let receivedDevTok: string | null = null;
    use(
      http.get("https://test.domo.com/api/query/v1/functions/statistics", ({ request }) => {
        receivedDevTok = request.headers.get("x-domo-developer-token");
        return HttpResponse.json({ ok: true });
      }),
    );
    const { client } = buildTestClient({
      domoDeveloperToken: "dev-token-xyz",
    });
    await client.request<{ ok: boolean }>({
      host: "instance",
      path: "/api/query/v1/functions/statistics",
    });
    expect(receivedDevTok).toBe("dev-token-xyz");
  });

  it("attaches query parameters", async () => {
    let receivedSearch: string | null = null;
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", ({ request }) => {
        receivedSearch = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );
    const { client } = buildTestClient();
    await client.request<unknown[]>({
      host: "platform",
      path: "/v1/datasets",
      query: { limit: 50, offset: 0 },
    });
    expect(receivedSearch).toContain("limit=50");
    expect(receivedSearch).toContain("offset=0");
  });

  it("paginates through offset/limit responses", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? "50");
        if (offset === 0)
          return HttpResponse.json(Array.from({ length: limit }, (_, i) => ({ id: `ds-${i}` })));
        if (offset === limit) return HttpResponse.json([{ id: `ds-${limit}` }]);
        return HttpResponse.json([]);
      }),
    );
    const { client } = buildTestClient();
    const all = await client.paginate<{ id: string }>({
      host: "platform",
      path: "/v1/datasets",
      limit: 5,
    });
    expect(all.length).toBe(6);
    expect(all[0]?.id).toBe("ds-0");
    expect(all[5]?.id).toBe("ds-5");
  });

  it("throws DomoApiError on a 4xx response", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets/nope", () =>
        HttpResponse.text("not found", { status: 404 }),
      ),
    );
    const { client } = buildTestClient();
    await expect(
      client.request({
        host: "platform",
        path: "/v1/datasets/nope",
      }),
    ).rejects.toBeInstanceOf(DomoApiError);
  });

  it("retries 401 after invalidating the OAuth token", async () => {
    let calls = 0;
    use(
      http.get("https://api.domo.com/oauth/token", () => {
        calls++;
        return HttpResponse.json({ access_token: `tok-${calls}`, expires_in: 3600 });
      }),
      http.get("https://api.domo.com/v1/users/me", ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth === "Bearer tok-1") return new HttpResponse("expired", { status: 401 });
        return HttpResponse.json({ id: 1 });
      }),
    );
    const { client } = buildTestClient({ domoMaxRetries: 2 });
    const me = await client.request<{ id: number }>({
      host: "platform",
      path: "/v1/users/me",
    });
    expect(me.id).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
