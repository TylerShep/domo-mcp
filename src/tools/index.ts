import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Services } from "../services.js";
import { registerCardTools } from "./cards.js";
import { registerDatasetTools } from "./datasets.js";
import { registerGovernanceTools } from "./governance.js";
import { registerIdentityTools } from "./identity.js";
import { registerMetadataTools } from "./metadata.js";
import { registerPageTools } from "./pages.js";
import { registerSemanticTools } from "./semantic.js";

export function registerAllTools(server: McpServer, services: Services): void {
  registerDatasetTools(server, services);
  registerCardTools(server, services);
  registerPageTools(server, services);
  registerIdentityTools(server, services);
  registerMetadataTools(server, services);
  registerGovernanceTools(server, services);
  registerSemanticTools(server, services);
}
