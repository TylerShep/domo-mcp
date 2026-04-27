import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerPageTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_list_pages",
    {
      title: "Domo: List Pages",
      description: "Paginated list of pages (dashboards) in the Domo instance.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
        all: z.boolean().default(false).describe("If true, fetch every page."),
      },
    },
    safeTool(async ({ limit, offset, all }) => {
      const pages = all
        ? await services.pages.listAll()
        : await services.pages.list({ limit, offset });
      return jsonResult({ count: pages.length, pages });
    }),
  );

  server.registerTool(
    "domo_get_page",
    {
      title: "Domo: Get Page",
      description: "Full metadata for a single page (dashboard).",
      inputSchema: { pageId: z.union([z.string(), z.number()]).describe("Domo page ID.") },
    },
    safeTool(async ({ pageId }) => jsonResult(await services.pages.get(pageId))),
  );

  server.registerTool(
    "domo_get_page_collections",
    {
      title: "Domo: Get Page Collections",
      description: "Card collections (sections) on a page.",
      inputSchema: { pageId: z.union([z.string(), z.number()]).describe("Domo page ID.") },
    },
    safeTool(async ({ pageId }) => jsonResult(await services.pages.getCollections(pageId))),
  );

  server.registerTool(
    "domo_get_page_tree",
    {
      title: "Domo: Get Page Tree",
      description:
        "Recursive page hierarchy starting from a root page. Useful for understanding complex dashboard suites. Requires DOMO_DEVELOPER_TOKEN (instance API).",
      inputSchema: {
        rootPageId: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Page ID to start the tree at."),
        rootPageName: z.string().optional().describe("Or, page name to start the tree at."),
      },
    },
    safeTool(async (args) => {
      const tree = await services.pages.getTree({
        ...(args.rootPageId !== undefined ? { rootPageId: args.rootPageId } : {}),
        ...(args.rootPageName !== undefined ? { rootPageName: args.rootPageName } : {}),
      });
      return jsonResult(tree);
    }),
  );
}
