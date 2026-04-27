import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseDatasetName } from "../domo/governance.js";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerGovernanceTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_parse_dataset_name",
    {
      title: "Domo: Parse Dataset Name",
      description:
        "Parse a dataset name following the convention `STAGE[VERSION][FREQ] | TOPIC | Specific Name`. Stateless; no API calls.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Dataset name, e.g. 'PROD2D | Sales | Pipeline Snapshot'."),
      },
    },
    safeTool(async ({ name }) => jsonResult(parseDatasetName(name))),
  );

  server.registerTool(
    "domo_datasets_by_topic",
    {
      title: "Domo: Datasets By Topic",
      description:
        "Return all datasets whose parsed name matches a topic (e.g. 'Sales', 'Operations'). Topic is the second segment of the `STAGE | TOPIC | Name` convention.",
      inputSchema: { topic: z.string().min(1) },
    },
    safeTool(async ({ topic }) => {
      const datasets = await services.governance.datasetsByTopic(topic);
      return jsonResult({ topic, count: datasets.length, datasets });
    }),
  );

  server.registerTool(
    "domo_topic_summary",
    {
      title: "Domo: Topic Summary",
      description:
        "Counts of datasets by parsed topic across the entire instance, sorted descending.",
      inputSchema: {},
    },
    safeTool(async () => jsonResult(await services.governance.topicSummary())),
  );

  server.registerTool(
    "domo_instance_summary",
    {
      title: "Domo: Instance Summary",
      description:
        "High-level instance health: total datasets/cards/users/groups, dataset counts by stage and topic, stale and unused dataset counts.",
      inputSchema: {},
    },
    safeTool(async () => jsonResult(await services.governance.instanceSummary())),
  );

  server.registerTool(
    "domo_stale_datasets",
    {
      title: "Domo: Stale Datasets",
      description:
        "Datasets that have not had data refreshed (or were last updated) in the last `days` days.",
      inputSchema: { days: z.number().int().min(1).max(3650).default(30) },
    },
    safeTool(async ({ days }) => {
      const datasets = await services.governance.staleDatasets({ days });
      return jsonResult({ thresholdDays: days, count: datasets.length, datasets });
    }),
  );

  server.registerTool(
    "domo_unused_datasets",
    {
      title: "Domo: Unused Datasets",
      description:
        "Datasets that no card references. May include staging or input-only datasets used by dataflows.",
      inputSchema: {},
    },
    safeTool(async () => {
      const datasets = await services.governance.unusedDatasets();
      return jsonResult({ count: datasets.length, datasets });
    }),
  );
}
