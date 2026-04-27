import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { AIProvider, ChatCompletionOptions } from "../../src/ai/gateway.js";
import { CardsApi } from "../../src/domo/cards.js";
import { DatasetsApi } from "../../src/domo/datasets.js";
import { PagesApi } from "../../src/domo/pages.js";
import { SemanticLayerGenerator } from "../../src/domo/semanticLayer.js";
import cardsFixture from "../fixtures/cards.json" with { type: "json" };
import datasetsFixture from "../fixtures/datasets.json" with { type: "json" };
import pagesFixture from "../fixtures/pages.json" with { type: "json" };
import { buildTestClient, oauthTokenHandler } from "../helpers.js";
import { use } from "../setup.js";

class FakeAIProvider implements AIProvider {
  readonly name = "fake";
  readonly defaultModel = "fake-model";
  readonly calls: ChatCompletionOptions[] = [];

  async chatCompletion(opts: ChatCompletionOptions): Promise<string> {
    this.calls.push(opts);
    if (opts.system.includes("dashboard")) {
      return "Test dashboard summary text.";
    }
    return `Business description for: ${opts.user.split("\n")[0]}`;
  }
}

describe("SemanticLayerGenerator", () => {
  it("generate produces a markdown document and per-card AI translations", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages/5000", () => HttpResponse.json(pagesFixture[0])),
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json(cardsFixture)),
      http.get("https://api.domo.com/v1/cards/card-100", () => HttpResponse.json(cardsFixture[0])),
      http.get("https://api.domo.com/v1/cards/card-101", () => HttpResponse.json(cardsFixture[1])),
      http.get("https://api.domo.com/v1/datasets/ds-1", () =>
        HttpResponse.json(datasetsFixture[0]),
      ),
      http.get("https://api.domo.com/v1/datasets/ds-2", () =>
        HttpResponse.json(datasetsFixture[1]),
      ),
    );
    const { client } = buildTestClient({ domoInstance: "test" });
    const pages = new PagesApi(client);
    const cards = new CardsApi(client);
    const datasets = new DatasetsApi(client);
    const ai = new FakeAIProvider();
    const gen = new SemanticLayerGenerator(pages, cards, datasets, null, ai, "test");

    const result = await gen.generate({ pageId: 5000 });

    expect(result.meta.dashboardName).toBe("Sales Overview");
    expect(result.meta.cardCount).toBe(2);
    expect(result.meta.aiProvider).toBe("fake");
    expect(result.markdown).toContain("# Sales Overview");
    expect(result.markdown).toContain("### 1. Pipeline by Stage");
    expect(result.markdown).toContain("### 2. Forecast vs Quota");
    expect(result.markdown).toContain("Test dashboard summary text.");
    expect(ai.calls.length).toBe(3);
  });

  it("generate throws when no cards are on the dashboard", async () => {
    const emptyPage = { id: 7000, name: "Empty Page" };
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/pages/7000", () => HttpResponse.json(emptyPage)),
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json([])),
    );
    const { client } = buildTestClient({ domoInstance: "test" });
    const pages = new PagesApi(client);
    const cards = new CardsApi(client);
    const datasets = new DatasetsApi(client);
    const gen = new SemanticLayerGenerator(
      pages,
      cards,
      datasets,
      null,
      new FakeAIProvider(),
      "test",
    );
    await expect(gen.generate({ pageId: 7000 })).rejects.toThrow(/No cards/);
  });

  it("explainCard returns an AI-generated business description", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/cards/card-100", () => HttpResponse.json(cardsFixture[0])),
      http.get("https://api.domo.com/v1/datasets/ds-1", () =>
        HttpResponse.json(datasetsFixture[0]),
      ),
    );
    const { client } = buildTestClient();
    const pages = new PagesApi(client);
    const cards = new CardsApi(client);
    const datasets = new DatasetsApi(client);
    const ai = new FakeAIProvider();
    const gen = new SemanticLayerGenerator(pages, cards, datasets, null, ai, undefined);
    const out = await gen.explainCard("card-100");
    expect(out).toContain("Business description for");
    expect(ai.calls.length).toBe(1);
  });
});
