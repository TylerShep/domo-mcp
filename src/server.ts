import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { Services } from "./services.js";
import { registerAllTools } from "./tools/index.js";
import { logger, setLogLevel } from "./utils/logger.js";

const PACKAGE_NAME = "@tylershep/domo-mcp";
const PACKAGE_VERSION = "0.1.0";

export async function startStdioServer(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const services = new Services(config);
  const server = new McpServer(
    {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: { listChanged: false },
      },
    },
  );

  registerAllTools(server, services);

  logger.info(
    `Starting domo-mcp ${PACKAGE_VERSION} (instance: ${config.domoInstance ?? "<none>"}, auth: ${JSON.stringify(services.auth.available)})`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close().catch(() => {});
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await server.close().catch(() => {});
    process.exit(0);
  });
}
