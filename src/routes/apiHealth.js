export async function handleApiHealth(req, res, deps) {
  const {
    startedAt,
    sendJson,
    hasOpenAI,
    config,
    isFirebaseConfigured,
    isNeonConfigured,
    providerName,
    storageBridgeMode,
    enrichmentQueue,
  } = deps;

  if (req.method !== "GET") return false;
  if (deps.url.pathname !== "/api/health") return false;

  const mem = process.memoryUsage();
  sendJson(res, 200, {
    ok: true,
    serverTime: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    openaiConfigured: hasOpenAI(),
    auth: {
      provider: config.authProvider,
      firebaseConfigured: await isFirebaseConfigured(),
      neonConfigured: isNeonConfigured(),
    },
    dbProvider: providerName,
    dbBridgeMode: storageBridgeMode,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    queue: {
      pending: enrichmentQueue.pending ?? 0,
      running: enrichmentQueue.active ?? 0,
      failed: enrichmentQueue.stats?.failed ?? 0,
      queued: enrichmentQueue.stats?.queued ?? 0,
      retry: enrichmentQueue.stats?.retry ?? 0,
      completed: enrichmentQueue.stats?.completed ?? 0,
      delayed: enrichmentQueue.stats?.delayed ?? 0,
      total: enrichmentQueue.stats?.total ?? 0,
    },
  });
  return true;
}
