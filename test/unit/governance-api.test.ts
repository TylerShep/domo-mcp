import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { CardsApi } from "../../src/domo/cards.js";
import { DatasetsApi } from "../../src/domo/datasets.js";
import { GovernanceApi } from "../../src/domo/governance.js";
import cardsFixture from "../fixtures/cards.json" with { type: "json" };
import datasetsFixture from "../fixtures/datasets.json" with { type: "json" };
import { buildTestClient, oauthTokenHandler } from "../helpers.js";
import { use } from "../setup.js";

describe("GovernanceApi", () => {
  it("topicSummary groups parsed datasets by topic", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const datasets = new DatasetsApi(client);
    const cards = new CardsApi(client);
    const gov = new GovernanceApi(client, datasets, cards);
    const summary = await gov.topicSummary();
    expect(summary.Sales).toBe(2);
    expect(summary.Operations).toBe(1);
  });

  it("stageSummary groups parsed datasets by stage", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const datasets = new DatasetsApi(client);
    const cards = new CardsApi(client);
    const gov = new GovernanceApi(client, datasets, cards);
    const summary = await gov.stageSummary();
    expect(summary.PROD).toBe(2);
    expect(summary.BETA).toBe(1);
  });

  it("staleDatasets returns datasets older than the cutoff", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const datasets = new DatasetsApi(client);
    const cards = new CardsApi(client);
    const gov = new GovernanceApi(client, datasets, cards);
    const stale = await gov.staleDatasets({ days: 30 });
    expect(stale.map((d) => d.id)).toContain("ds-3");
    expect(stale.map((d) => d.id)).not.toContain("ds-2");
  });

  it("unusedDatasets reports datasets that are not on any card", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
      http.get("https://api.domo.com/v1/cards", () => HttpResponse.json([cardsFixture[0]])),
    );
    const { client } = buildTestClient();
    const datasets = new DatasetsApi(client);
    const cards = new CardsApi(client);
    const gov = new GovernanceApi(client, datasets, cards);
    const unused = await gov.unusedDatasets();
    expect(unused.map((d) => d.id).sort()).toEqual(["ds-2", "ds-3"]);
  });

  it("datasetsByTopic filters parsed datasets case-insensitively", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const datasets = new DatasetsApi(client);
    const cards = new CardsApi(client);
    const gov = new GovernanceApi(client, datasets, cards);
    const sales = await gov.datasetsByTopic("sales");
    expect(sales.map((d) => d.id)).toEqual(["ds-1", "ds-2"]);
  });
});
