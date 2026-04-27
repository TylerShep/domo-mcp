import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerMetadataTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_export_beast_modes",
    {
      title: "Domo: Export Beast Modes",
      description:
        "Export beast modes (calculated columns) for one or more datasets. Returns the calculation expressions, owners, and links. Requires instance API auth.",
      inputSchema: {
        datasetIds: z
          .array(z.string())
          .min(1)
          .describe("List of dataset IDs to fetch beast modes for."),
        datasetIdToName: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional id->name map to enrich the response."),
        concurrency: z.number().int().min(1).max(20).default(8),
      },
    },
    safeTool(async ({ datasetIds, datasetIdToName, concurrency }) => {
      const result = await services.beastModes().exportForDatasets({
        datasetIds,
        ...(datasetIdToName !== undefined ? { datasetIdToName } : {}),
        concurrency,
      });
      return jsonResult(result);
    }),
  );

  server.registerTool(
    "domo_get_beast_mode",
    {
      title: "Domo: Get Beast Mode",
      description: "Fetch a single beast mode's full detail (including the SQL/calc expression).",
      inputSchema: { beastModeId: z.number().int().describe("Numeric beast mode ID.") },
    },
    safeTool(async ({ beastModeId }) =>
      jsonResult(await services.beastModes().getDetail(beastModeId)),
    ),
  );

  server.registerTool(
    "domo_document_dataflow",
    {
      title: "Domo: Document Dataflow",
      description:
        "Generate a structured documentation object for a Magic ETL dataflow: inputs, transforms, outputs, last execution stats. Requires instance API auth (dev token preferred).",
      inputSchema: {
        dataflowId: z.union([z.string(), z.number()]).describe("Numeric dataflow ID."),
      },
    },
    safeTool(async ({ dataflowId }) => jsonResult(await services.dataflows.document(dataflowId))),
  );

  server.registerTool(
    "domo_export_card_metadata",
    {
      title: "Domo: Export Card Metadata",
      description:
        "Export detailed metadata for cards in the instance. By default returns a metadata summary for every visible card; pass datasetIds to filter to cards using those datasets.",
      inputSchema: {
        datasetIds: z
          .array(z.string())
          .optional()
          .describe("If provided, only return cards using these datasets."),
        limit: z.number().int().min(1).max(10000).default(500),
      },
    },
    safeTool(async ({ datasetIds, limit }) => {
      const cards = await services.cards.list({ limit });
      const filtered = datasetIds
        ? cards.filter((c) => c.datasourceIds.some((id) => datasetIds.includes(id)))
        : cards;
      return jsonResult({ count: filtered.length, cards: filtered });
    }),
  );

  server.registerTool(
    "domo_export_redshift_connector_queries",
    {
      title: "Domo: Export Redshift Connector Queries",
      description:
        "Find every dataset backed by the Redshift connector and return its source SQL plus connector settings. Requires both OAuth (for the dataset list) and instance auth (for the streams).",
      inputSchema: { concurrency: z.number().int().min(1).max(20).default(8) },
    },
    safeTool(async ({ concurrency }) =>
      jsonResult(await services.redshift().exportAll({ concurrency })),
    ),
  );

  server.registerTool(
    "domo_get_redshift_query_for_dataset",
    {
      title: "Domo: Get Redshift Query For Dataset",
      description:
        "Get the connector SQL for a single dataset (only returns data if the dataset is Redshift-backed).",
      inputSchema: { datasetId: z.string().min(1) },
    },
    safeTool(async ({ datasetId }) => {
      const result = await services.redshift().getQueryForDataset(datasetId);
      if (!result) return jsonResult({ datasetId, isRedshift: false });
      const { datasetId: _drop, ...rest } = result;
      return jsonResult({ datasetId, isRedshift: true, ...rest });
    }),
  );
}
