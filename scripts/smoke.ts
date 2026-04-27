/**
 * Live smoke test against a real Domo instance.
 *
 * Reads credentials from .env / environment and exercises a small handful
 * of read-only endpoints to confirm the wiring is healthy. Skip-friendly:
 * if no Domo creds are set, this script no-ops with a useful message.
 */

import { loadConfig } from "../src/config.js";
import { Services } from "../src/services.js";
import { logger } from "../src/utils/logger.js";

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    logger.warn(`Skipping smoke test: ${(err as Error).message}`);
    process.exit(0);
  }

  const services = new Services(config);

  logger.info("Smoke: verifying auth strategies available...");
  const auth = services.auth.available;
  logger.info(`  developerToken=${auth.developerToken} oauth=${auth.oauth} browser=${auth.browser}`);

  if (services.auth.available.oauth) {
    logger.info("Smoke: listing first page of datasets via platform host...");
    const datasets = await services.datasets.list({ limit: 5 });
    logger.info(`  ok - ${datasets.length} datasets`);

    logger.info("Smoke: whoami...");
    const me = await services.users.whoami();
    logger.info(`  ok - ${me.email ?? me.id}`);
  }

  if (services.auth.available.developerToken) {
    logger.info("Smoke: instance host pages...");
    const pages = await services.pages.list({ limit: 5 });
    logger.info(`  ok - ${pages.length} pages`);
  }

  logger.info("Smoke: done.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
