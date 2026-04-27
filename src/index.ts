import { startStdioServer } from "./server.js";

startStdioServer().catch((err) => {
  process.stderr.write(
    `domo-mcp fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
