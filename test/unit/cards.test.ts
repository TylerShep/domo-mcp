import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { CardsApi } from "../../src/domo/cards.js";
import cardsFixture from "../fixtures/cards.json" with { type: "json" };
import { buildTestClient, oauthTokenHandler } from "../helpers.js";
import { use } from "../setup.js";

describe("CardsApi", () => {
  it("list maps cards to summaries", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json(cardsFixture)),
    );
    const { client } = buildTestClient();
    const api = new CardsApi(client);
    const summaries = await api.list();
    expect(summaries.length).toBe(3);
    expect(summaries[0]).toMatchObject({
      cardId: "card-100",
      title: "Pipeline by Stage",
      pageId: "5000",
      pageName: "Sales Overview",
      datasourceIds: ["ds-1"],
    });
  });

  it("list filters by page name", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json(cardsFixture)),
    );
    const { client } = buildTestClient();
    const api = new CardsApi(client);
    const summaries = await api.list({ page: "Operations Dashboard" });
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.cardId).toBe("card-200");
  });

  it("list filters by required tags", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json(cardsFixture)),
    );
    const { client } = buildTestClient();
    const api = new CardsApi(client);
    const summaries = await api.list({ tags: ["sales", "forecast"] });
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.cardId).toBe("card-101");
  });

  it("list excludes cards with excludeTags", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json(cardsFixture)),
    );
    const { client } = buildTestClient();
    const api = new CardsApi(client);
    const summaries = await api.list({ excludeTags: ["operations"] });
    expect(summaries.map((c) => c.cardId)).toEqual(["card-100", "card-101"]);
  });

  it("renderPng returns base64-encoded image bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    let receivedBody: unknown = null;
    use(
      oauthTokenHandler,
      http.post("https://api.domo.com/v1/cards/card-100/render", async ({ request }) => {
        receivedBody = await request.json();
        return new HttpResponse(png, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }),
    );
    const { client } = buildTestClient();
    const api = new CardsApi(client);
    const out = await api.renderPng({ cardId: "card-100", width: 800, height: 600 });
    expect(receivedBody).toEqual({ format: "png", width: 800, height: 600 });
    expect(out.contentType).toBe("image/png");
    expect(out.bytes).toBe(png.byteLength);
    expect(Buffer.from(out.base64, "base64")).toEqual(Buffer.from(png));
  });
});
