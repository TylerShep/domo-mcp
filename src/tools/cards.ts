import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerCardTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_list_cards",
    {
      title: "Domo: List Cards",
      description:
        "List cards visible to the authenticated client, with optional page/tag filters.",
      inputSchema: {
        page: z.string().optional().describe("Filter to cards on this page (exact name)."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Only return cards that have ALL of these tags."),
        excludeTags: z
          .array(z.string())
          .optional()
          .describe("Exclude cards with ANY of these tags."),
        limit: z.number().int().min(1).max(10000).default(500),
      },
    },
    safeTool(async (args) => {
      const cards = await services.cards.list({
        ...(args.page !== undefined ? { page: args.page } : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.excludeTags !== undefined ? { excludeTags: args.excludeTags } : {}),
        limit: args.limit,
      });
      return jsonResult({ count: cards.length, cards });
    }),
  );

  server.registerTool(
    "domo_get_card",
    {
      title: "Domo: Get Card",
      description: "Full metadata for a single card.",
      inputSchema: { cardId: z.union([z.string(), z.number()]).describe("Domo card ID.") },
    },
    safeTool(async ({ cardId }) => jsonResult(await services.cards.get(cardId))),
  );

  server.registerTool(
    "domo_render_card_png",
    {
      title: "Domo: Render Card as PNG",
      description:
        "Render a Domo card as a PNG image. Returns the image inline as an MCP image content block, plus metadata in a text block.",
      inputSchema: {
        cardId: z.union([z.string(), z.number()]).describe("Domo card ID."),
        width: z
          .number()
          .int()
          .min(100)
          .max(4000)
          .default(1100)
          .describe("Output image width in pixels."),
        height: z
          .number()
          .int()
          .min(100)
          .max(4000)
          .default(700)
          .describe("Output image height in pixels."),
      },
    },
    safeTool(async ({ cardId, width, height }) => {
      const result = await services.cards.renderPng({ cardId, width, height });
      const out: CallToolResult = {
        content: [
          {
            type: "image",
            data: result.base64,
            mimeType: result.contentType,
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                cardId: String(cardId),
                width,
                height,
                bytes: result.bytes,
                contentType: result.contentType,
              },
              null,
              2,
            ),
          },
        ],
      };
      return out;
    }),
  );

  server.registerTool(
    "domo_get_dataset_for_card",
    {
      title: "Domo: Get Dataset for Card",
      description:
        "Resolve the underlying dataset(s) feeding a given card. Returns dataset IDs and full metadata when available.",
      inputSchema: { cardId: z.union([z.string(), z.number()]).describe("Domo card ID.") },
    },
    safeTool(async ({ cardId }) => {
      const card = await services.cards.get(cardId);
      const datasourceIds = (card.datasources ?? [])
        .map((d) => d.id)
        .filter((id): id is string => Boolean(id));
      const datasets = await Promise.all(
        datasourceIds.map(async (id) => {
          try {
            return await services.datasets.get(id);
          } catch {
            return { id, name: "(unavailable)" };
          }
        }),
      );
      return jsonResult({ cardId: String(cardId), datasourceIds, datasets });
    }),
  );

  server.registerTool(
    "domo_recently_modified_cards",
    {
      title: "Domo: Recently Modified Cards",
      description:
        "Return cards modified in the last `days` days. Slow on large instances - we cap at 200 cards inspected.",
      inputSchema: { days: z.number().int().min(1).max(365).default(7) },
    },
    safeTool(async ({ days }) => {
      const cards = await services.governance.recentlyModifiedCards({ days });
      return jsonResult({ count: cards.length, cards });
    }),
  );
}
