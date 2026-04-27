import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { PagesApi } from "../../src/domo/pages.js";
import pagesFixture from "../fixtures/pages.json" with { type: "json" };
import { buildTestClient, oauthTokenHandler } from "../helpers.js";
import { use } from "../setup.js";

describe("PagesApi", () => {
  it("list returns the response array", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages", () => HttpResponse.json(pagesFixture)),
    );
    const { client } = buildTestClient();
    const api = new PagesApi(client);
    const all = await api.list();
    expect(all.length).toBe(3);
  });

  it("get returns a single page", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages/5000", () => HttpResponse.json(pagesFixture[0])),
    );
    const { client } = buildTestClient();
    const api = new PagesApi(client);
    const page = await api.get(5000);
    expect(page.name).toBe("Sales Overview");
  });

  it("getTree recursively walks instance hierarchy", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages/5000", () => HttpResponse.json(pagesFixture[0])),
      http.get("https://test.domo.com/api/content/v1/pages/5000", () =>
        HttpResponse.json({
          children: [{ id: 5001, name: "Sales Pipeline Detail" }],
          cardIds: [100, 101],
        }),
      ),
      http.get("https://test.domo.com/api/content/v1/pages/5001", () =>
        HttpResponse.json({
          children: [],
          cardIds: [102],
        }),
      ),
    );
    const { client } = buildTestClient({
      domoInstance: "test",
      domoDeveloperToken: "dev-tok",
    });
    const api = new PagesApi(client);
    const tree = await api.getTree({ rootPageId: 5000 });
    expect(tree.id).toBe("5000");
    expect(tree.name).toBe("Sales Overview");
    expect(tree.cardCount).toBe(2);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0]?.id).toBe("5001");
    expect(tree.children[0]?.cardCount).toBe(1);
  });

  it("getTree resolves a page by name", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages", () => HttpResponse.json(pagesFixture)),
      http.get("https://test.domo.com/api/content/v1/pages/6000", () =>
        HttpResponse.json({ children: [], cardIds: [200] }),
      ),
    );
    const { client } = buildTestClient({
      domoInstance: "test",
      domoDeveloperToken: "dev-tok",
    });
    const api = new PagesApi(client);
    const tree = await api.getTree({ rootPageName: "Operations Dashboard" });
    expect(tree.id).toBe("6000");
    expect(tree.children.length).toBe(0);
  });

  it("getTree throws when page name is not found", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages", () => HttpResponse.json(pagesFixture)),
    );
    const { client } = buildTestClient({
      domoInstance: "test",
      domoDeveloperToken: "dev-tok",
    });
    const api = new PagesApi(client);
    await expect(api.getTree({ rootPageName: "Nonexistent" })).rejects.toThrow();
  });
});
