import crypto from "node:crypto";
import { logger } from "../../logger.js";
import {
  isPlainObject,
  normalizeText,
  parseRawArgs,
  stableStringify,
} from "./argUtils.js";
import { normalizeToolArgs } from "./normalizeToolArgs.js";

export function createAgentToolHarness({
  actor = null,
  requestId = "",
  executeTool,
  resolveArgs = null,
  idempotencyCacheMaxEntries = 128,
} = {}) {
  if (typeof executeTool !== "function") {
    throw new Error("createAgentToolHarness requires executeTool(name, args, actor)");
  }

  const idempotencyCache = new Map();
  const parsedCacheLimit = Number(idempotencyCacheMaxEntries);
  const normalizedCacheMaxEntries =
    Number.isFinite(parsedCacheLimit) && parsedCacheLimit >= 0 ? Math.floor(parsedCacheLimit) : 128;
  const traces = [];
  const normalizedRequestId = normalizeText(requestId) || crypto.randomUUID();

  function getCacheEntry(key = "") {
    if (!key || normalizedCacheMaxEntries < 1 || !idempotencyCache.has(key)) {
      return { hit: false, value: undefined };
    }
    const value = idempotencyCache.get(key);
    // Refresh insertion order so frequently-used entries stay hot.
    idempotencyCache.delete(key);
    idempotencyCache.set(key, value);
    return { hit: true, value };
  }

  function setCacheEntry(key = "", value = null) {
    if (!key || normalizedCacheMaxEntries < 1) return;
    if (idempotencyCache.has(key)) {
      idempotencyCache.delete(key);
    }
    idempotencyCache.set(key, value);
    while (idempotencyCache.size > normalizedCacheMaxEntries) {
      const oldestKey = idempotencyCache.keys().next().value;
      if (!oldestKey) break;
      idempotencyCache.delete(oldestKey);
    }
  }

  async function runToolCall({ name, rawArgs, callId = "", round = 0 } = {}) {
    const traceId = crypto.randomUUID();
    const startedAtMs = Date.now();
    const normalizedName = normalizeText(name);

    let parsedArgs = {};
    let resolvedArgs = {};
    let normalizedArgs = {};
    let idempotencyKey = "";
    try {
      parsedArgs = parseRawArgs(rawArgs);
      if (typeof resolveArgs === "function") {
        const maybeResolved = await resolveArgs(normalizedName, parsedArgs, {
          actor,
          requestId: normalizedRequestId,
          callId: normalizeText(callId),
          round: Number(round) || 0,
        });
        resolvedArgs = isPlainObject(maybeResolved) ? maybeResolved : parsedArgs;
      } else {
        resolvedArgs = parsedArgs;
      }
      normalizedArgs = normalizeToolArgs(normalizedName, resolvedArgs);
      idempotencyKey = `${normalizedName}:${stableStringify(normalizedArgs)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey: "",
        cacheHit: false,
        status: "validation_error",
        error: message,
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.warn("agent_tool_validation_failed", trace);
      return {
        ok: false,
        error: message,
        trace,
      };
    }

    const cacheEntry = getCacheEntry(idempotencyKey);
    if (cacheEntry.hit) {
      const cachedResult = cacheEntry.value;
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey,
        cacheHit: true,
        status: "success",
        error: "",
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.info("agent_tool_cache_hit", trace);
      return {
        ok: true,
        result: cachedResult,
        trace,
      };
    }

    try {
      const result = await executeTool(normalizedName, normalizedArgs, actor);
      setCacheEntry(idempotencyKey, result);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey,
        cacheHit: false,
        status: "success",
        error: "",
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.info("agent_tool_executed", trace);
      return {
        ok: true,
        result,
        trace,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey,
        cacheHit: false,
        status: "error",
        error: message,
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.warn("agent_tool_failed", trace);
      return {
        ok: false,
        error: message,
        trace,
      };
    }
  }

  return {
    requestId: normalizedRequestId,
    actor: actor
      ? {
          userId: normalizeText(actor.userId),
          workspaceId: normalizeText(actor.workspaceId),
          role: normalizeText(actor.role),
        }
      : null,
    traces,
    runToolCall,
  };
}
