import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerDatasetTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_test_connection",
    {
      title: "Domo: Test Connection",
      description:
        "Verify Domo credentials work and report which auth modes are active. Calls /v1/users/me to confirm OAuth, and pings the instance host if a developer token is set.",
      inputSchema: {},
    },
    safeTool(async () => {
      const available = services.auth.available;
      let oauthOk = false;
      let oauthIdentity: unknown = null;
      let oauthError: string | null = null;
      if (available.oauth) {
        try {
          oauthIdentity = await services.users.whoami();
          oauthOk = true;
        } catch (err) {
          oauthError = (err as Error).message;
        }
      }
      let instanceOk = false;
      let instanceError: string | null = null;
      if (services.auth.hasInstance() && (available.developerToken || available.oauth)) {
        try {
          await services.client.request<unknown>({
            host: "instance",
            path: "/api/query/v1/functions/statistics",
          });
          instanceOk = true;
        } catch (err) {
          instanceError = (err as Error).message;
        }
      }
      return jsonResult({
        ok: oauthOk || instanceOk,
        instance: services.config.domoInstance ?? null,
        apiHost: services.config.domoApiHost,
        authAvailable: available,
        platformApi: { ok: oauthOk, identity: oauthIdentity, error: oauthError },
        instanceApi: { ok: instanceOk, error: instanceError },
      });
    }),
  );

  server.registerTool(
    "domo_list_datasets",
    {
      title: "Domo: List Datasets",
      description:
        "Paginated list of datasets in the Domo instance. Returns up to `limit` datasets at `offset`.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Number of datasets to return."),
        offset: z.number().int().min(0).default(0).describe("Pagination offset."),
        all: z
          .boolean()
          .default(false)
          .describe("If true, ignore limit/offset and fetch every dataset (uses pagination)."),
      },
    },
    safeTool(async ({ limit, offset, all }) => {
      const datasets = all
        ? await services.datasets.listAll()
        : await services.datasets.list({ limit, offset });
      return jsonResult({ count: datasets.length, datasets });
    }),
  );

  server.registerTool(
    "domo_get_dataset",
    {
      title: "Domo: Get Dataset",
      description: "Full metadata for a single dataset (schema columns, owner, sizes, timestamps).",
      inputSchema: { datasetId: z.string().min(1).describe("Domo dataset ID (UUID).") },
    },
    safeTool(async ({ datasetId }) => jsonResult(await services.datasets.get(datasetId))),
  );

  server.registerTool(
    "domo_get_dataset_schema",
    {
      title: "Domo: Get Dataset Schema",
      description: "Just the column list and types for a dataset.",
      inputSchema: { datasetId: z.string().min(1).describe("Domo dataset ID (UUID).") },
    },
    safeTool(async ({ datasetId }) =>
      jsonResult({ datasetId, schema: await services.datasets.getSchema(datasetId) }),
    ),
  );

  server.registerTool(
    "domo_query_dataset",
    {
      title: "Domo: Query Dataset (SQL)",
      description:
        "Run a SQL query against a Domo dataset. The dataset is referenced as `table` in your SQL. Example: `SELECT category, SUM(amount) FROM table GROUP BY category`.",
      inputSchema: {
        datasetId: z.string().min(1).describe("Domo dataset ID (UUID)."),
        sql: z
          .string()
          .min(1)
          .describe(
            "SQL query. Reference the dataset as `table` (e.g. SELECT * FROM table LIMIT 10).",
          ),
      },
    },
    safeTool(async ({ datasetId, sql }) =>
      jsonResult(await services.datasets.query({ datasetId, sql })),
    ),
  );

  server.registerTool(
    "domo_export_dataset_csv",
    {
      title: "Domo: Export Dataset CSV",
      description:
        "Download the full row-level contents of a dataset as CSV. WARNING: full data transfer; only use when the user explicitly asks to export/download.",
      inputSchema: {
        datasetId: z.string().min(1).describe("Domo dataset ID (UUID)."),
        includeHeader: z.boolean().default(true).describe("Include the header row."),
        maxBytes: z
          .number()
          .int()
          .positive()
          .default(2_000_000)
          .describe(
            "Truncate the response to this many bytes to avoid blowing up the agent context.",
          ),
      },
    },
    safeTool(async ({ datasetId, includeHeader, maxBytes }) => {
      const csv = await services.datasets.exportCsv({ datasetId, includeHeader });
      const truncated = csv.length > maxBytes;
      return jsonResult({
        datasetId,
        bytes: csv.length,
        truncated,
        csv: truncated ? csv.slice(0, maxBytes) : csv,
      });
    }),
  );

  server.registerTool(
    "domo_search_datasets",
    {
      title: "Domo: Search Datasets",
      description: "Search datasets by name, description, or owner (case-insensitive substring).",
      inputSchema: {
        term: z.string().min(1).describe("Search term."),
        limit: z.number().int().min(1).max(500).default(50),
      },
    },
    safeTool(async ({ term, limit }) =>
      jsonResult(await services.datasets.search({ term, limit })),
    ),
  );

  server.registerTool(
    "domo_get_dataset_by_name",
    {
      title: "Domo: Get Dataset by Name",
      description:
        "Resolve a dataset ID by exact name match, falling back to fuzzy substring match unless `exact` is true.",
      inputSchema: {
        name: z.string().min(1).describe("Dataset name to look up."),
        exact: z.boolean().default(false).describe("If true, only return on exact match."),
      },
    },
    safeTool(async ({ name, exact }) => {
      const result = await services.datasets.findByName({ name, exact });
      if (!result) return jsonResult({ name, found: false });
      return jsonResult({ name, found: true, dataset: result });
    }),
  );
}
