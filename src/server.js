import http from "node:http";
import path from "node:path";
import { config, ROOT_DIR } from "./config.js";
import { logger, requestLogger } from "./logger.js";
import { createRateLimiter } from "./rateLimit.js";
import { sendJson, sendText } from "./http/responseUtils.js";
import { sanitizePath, serveFile } from "./http/staticFiles.js";
import { createApiRuntime } from "./serverRuntime/createApiRuntime.js";
import { createHttpRequestHandler } from "./serverRuntime/httpRequestHandler.js";

const startedAt = Date.now();
const checkRate = createRateLimiter();
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const apiRuntime = createApiRuntime({ startedAt, logger });

const requestHandler = createHttpRequestHandler({
  checkRate,
  handleApi: apiRuntime.handleApi,
  requestLogger,
  config,
  PUBLIC_DIR,
  sanitizePath,
  sendText,
  serveFile,
  logger,
  sendJson,
});

const server = http.createServer(requestHandler);

async function startServer() {
  const { ensurePostgresReady } = await import("./postgres/runtime.js");
  await ensurePostgresReady();
  await apiRuntime.enrichmentQueue.start();

  server.listen(config.port, () => {
    logger.info("server_start", {
      url: `http://localhost:${config.port}`,
      dbProvider: apiRuntime.providerName,
      dbBridgeMode: apiRuntime.storageBridgeMode,
      openai: apiRuntime.hasOpenAI(),
    });
    if (!apiRuntime.hasOpenAI()) {
      logger.warn("openai_missing", { msg: "Running with heuristic enrichment/retrieval fallback" });
    }
  });
}

startServer().catch((error) => {
  logger.error("server_start_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
