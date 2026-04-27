import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { DatasetsApi } from "../../src/domo/datasets.js";
import datasetsFixture from "../fixtures/datasets.json" with { type: "json" };
import { buildTestClient, oauthTokenHandler } from "../helpers.js";
import { use } from "../setup.js";

describe("DatasetsApi", () => {
  it("list returns the response array", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const all = await api.list({ limit: 50 });
    expect(all.length).toBe(3);
    expect(all[0]?.id).toBe("ds-1");
  });

  it("get fetches a dataset by id", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets/ds-2", () =>
        HttpResponse.json(datasetsFixture[1]),
      ),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const ds = await api.get("ds-2");
    expect(ds.name).toBe("PROD2D | Sales | Forecast");
  });

  it("findByName matches case-insensitively as a fuzzy fallback", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const hit = await api.findByName({ name: "forecast" });
    expect(hit?.id).toBe("ds-2");
  });

  it("findByName returns null with exact=true and no exact match", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const hit = await api.findByName({ name: "forecast", exact: true });
    expect(hit).toBeNull();
  });

  it("search returns trimmed dataset summaries", async () => {
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets", () => HttpResponse.json(datasetsFixture)),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const result = await api.search({ term: "sales" });
    expect(result.total).toBe(2);
    expect(result.datasets.every((d) => d.name?.toLowerCase().includes("sales"))).toBe(true);
    const first = result.datasets[0];
    expect(first).toBeDefined();
    expect(Object.keys(first as object)).not.toContain("schema");
  });

  it("query posts SQL and parses the response", async () => {
    let receivedBody: unknown = null;
    use(
      oauthTokenHandler,
      http.post("https://api.domo.com/v1/datasets/query/execute/ds-1", async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          columns: ["id", "name"],
          rows: [
            [1, "alpha"],
            [2, "beta"],
          ],
          numRows: 2,
        });
      }),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const result = await api.query({
      datasetId: "ds-1",
      sql: "SELECT id, name FROM table",
    });
    expect(receivedBody).toEqual({ sql: "SELECT id, name FROM table" });
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rowCount).toBe(2);
    expect(result.rows.length).toBe(2);
  });

  it("exportCsv returns text and asks for text/csv", async () => {
    let receivedAccept: string | null = null;
    use(
      oauthTokenHandler,
      http.get("https://api.domo.com/v1/datasets/ds-3/data", ({ request }) => {
        receivedAccept = request.headers.get("accept");
        return new HttpResponse("id,name\n1,alpha\n", {
          status: 200,
          headers: { "content-type": "text/csv" },
        });
      }),
    );
    const { client } = buildTestClient();
    const api = new DatasetsApi(client);
    const csv = await api.exportCsv({ datasetId: "ds-3" });
    expect(csv).toContain("id,name");
    expect(receivedAccept).toBe("text/csv");
  });
});
