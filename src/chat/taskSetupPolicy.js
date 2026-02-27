import crypto from "node:crypto";
import { normalizeTaskSpec } from "../tasks/taskSpec.js";

function asText(value = "") {
  return String(value || "").trim();
}

function clampPositiveInt(value, fallback, { min = 1, max = 10080 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeIsoDateTime(value = "") {
  const raw = asText(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function normalizeScopeType(value = "", scopeFolder = "") {
  const normalized = asText(value).toLowerCase();
  if (normalized === "workspace" || normalized === "folder") return normalized;
  return scopeFolder ? "folder" : "workspace";
}

export function normalizeTaskDraftForPolicy(source, { requireTitle = true } = {}) {
  const input = source && typeof source === "object" ? source : {};
  const title = asText(input.title || input.name);
  if (requireTitle && !title) return null;

  const scopeFolder = asText(input.scopeFolder || input.project);
  const intervalMinutesRaw = clampPositiveInt(input.intervalMinutes, null, { min: 5, max: 10080 });
  const rawScheduleType = asText(input.scheduleType).toLowerCase();
  const scheduleType = rawScheduleType === "manual" || rawScheduleType === "interval"
    ? rawScheduleType
    : (intervalMinutesRaw ? "interval" : "manual");

  const intervalMinutes = scheduleType === "interval" ? (intervalMinutesRaw || 1440) : null;
  const scopeType = normalizeScopeType(input.scopeType, scopeFolder);
  const prompt = asText(input.prompt || title);
  const spec = normalizeTaskSpec(input.spec ?? input.taskSpec, {
    title,
    prompt,
    scopeFolder,
    scheduleType,
    intervalMinutes,
  });

  return {
    ...(title ? { title } : {}),
    prompt,
    scopeType,
    scopeFolder,
    scheduleType,
    intervalMinutes,
    timezone: asText(input.timezone),
    nextRunAt: normalizeIsoDateTime(input.nextRunAt),
    maxActionsPerRun: clampPositiveInt(input.maxActionsPerRun, 4, { min: 1, max: 25 }),
    maxConsecutiveFailures: clampPositiveInt(input.maxConsecutiveFailures, 3, { min: 1, max: 20 }),
    dryRun: input.dryRun === true,
    spec,
  };
}

export function buildTaskProposalSignature(source) {
  const normalized = normalizeTaskDraftForPolicy(source, { requireTitle: true });
  if (!normalized) return "";
  const stablePayload = JSON.stringify(normalized);
  const digest = crypto.createHash("sha256").update(stablePayload).digest("hex");
  return `tp_${digest.slice(0, 32)}`;
}

export function extractAcceptedTaskProposalContext(body = null) {
  const context = body && typeof body === "object" ? body.taskSetupContext : null;
  if (!context || typeof context !== "object") return null;

  const source = context.acceptedProposal && typeof context.acceptedProposal === "object"
    ? context.acceptedProposal
    : context.answeredProposal && typeof context.answeredProposal === "object"
      ? context.answeredProposal
      : context.proposal && typeof context.proposal === "object"
        ? context.proposal
        : null;
  if (!source) return null;

  const proposal = normalizeTaskDraftForPolicy(source, { requireTitle: true });
  if (!proposal) return null;

  const providedSignature = asText(source.proposalSignature || context.proposalSignature);
  const proposalSignature = providedSignature || buildTaskProposalSignature(proposal);
  if (!proposalSignature) return null;

  return { proposal, proposalSignature };
}
