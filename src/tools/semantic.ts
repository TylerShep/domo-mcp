import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerSemanticTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_generate_semantic_layer",
    {
      title: "Domo: Generate Semantic Layer",
      description:
        "Generate a markdown business-language doc for a Domo dashboard: overview, per-card descriptions, calculations explained in plain English. Requires AI provider (set AI_PROVIDER and the matching key).",
      inputSchema: {
        pageId: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Page (dashboard) ID. Provide this OR pageName."),
        pageName: z.string().optional().describe("Page (dashboard) name. Provide this OR pageId."),
        maxCards: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Cap the number of cards translated. Each card costs one AI call."),
      },
    },
    safeTool(async (args) => {
      const result = await services.semanticLayer().generate({
        ...(args.pageId !== undefined ? { pageId: args.pageId } : {}),
        ...(args.pageName !== undefined ? { pageName: args.pageName } : {}),
        maxCards: args.maxCards,
      });
      return jsonResult(result);
    }),
  );

  server.registerTool(
    "domo_explain_card_in_business_terms",
    {
      title: "Domo: Explain Card In Business Terms",
      description:
        "Plain-English explanation of one card: what it shows, what its calculations mean, what business decisions it supports. Requires AI provider.",
      inputSchema: { cardId: z.union([z.string(), z.number()]).describe("Domo card ID.") },
    },
    safeTool(async ({ cardId }) => {
      const explanation = await services.semanticLayer().explainCard(cardId);
      return jsonResult({ cardId: String(cardId), explanation });
    }),
  );
}
