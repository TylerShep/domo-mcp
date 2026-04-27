import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Services } from "../services.js";
import { jsonResult, safeTool } from "./util.js";

export function registerIdentityTools(server: McpServer, services: Services): void {
  server.registerTool(
    "domo_list_users",
    {
      title: "Domo: List Users",
      description: "Paginated list of users in the Domo instance.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
        all: z.boolean().default(false),
      },
    },
    safeTool(async ({ limit, offset, all }) => {
      const users = all
        ? await services.users.listAll()
        : await services.users.list({ limit, offset });
      return jsonResult({ count: users.length, users });
    }),
  );

  server.registerTool(
    "domo_get_user",
    {
      title: "Domo: Get User",
      description: "Single user details by ID.",
      inputSchema: { userId: z.union([z.string(), z.number()]) },
    },
    safeTool(async ({ userId }) => jsonResult(await services.users.get(userId))),
  );

  server.registerTool(
    "domo_list_groups",
    {
      title: "Domo: List Groups",
      description: "Paginated list of groups in the Domo instance.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
        all: z.boolean().default(false),
      },
    },
    safeTool(async ({ limit, offset, all }) => {
      const groups = all
        ? await services.groups.listAll()
        : await services.groups.list({ limit, offset });
      return jsonResult({ count: groups.length, groups });
    }),
  );

  server.registerTool(
    "domo_get_group",
    {
      title: "Domo: Get Group",
      description: "Single group details by ID.",
      inputSchema: { groupId: z.union([z.string(), z.number()]) },
    },
    safeTool(async ({ groupId }) => jsonResult(await services.groups.get(groupId))),
  );
}
