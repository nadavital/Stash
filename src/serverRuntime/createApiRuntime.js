import { createApiHandler } from "../routes/apiRouter.js";
import { runtimeStaticDeps } from "./runtimeStaticDeps.js";
import { buildApiHandlerDeps, createRuntimeServices } from "./runtimeBuilders.js";

export function createApiRuntime({ startedAt, logger }) {
  const runtimeServices = createRuntimeServices(runtimeStaticDeps, { logger });
  const handleApi = createApiHandler(buildApiHandlerDeps(runtimeStaticDeps, runtimeServices, { startedAt, logger }));

  return {
    handleApi,
    providerName: runtimeStaticDeps.providerName,
    storageBridgeMode: runtimeStaticDeps.storageBridgeMode,
    hasOpenAI: runtimeStaticDeps.hasOpenAI,
    enrichmentQueue: runtimeStaticDeps.enrichmentQueue,
  };
}
