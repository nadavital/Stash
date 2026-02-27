import { noteTypeIconName, renderIcon } from "../../services/icons.js";

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderActivityFeedHTML({
  title = "Recent",
  subtitle = "",
} = {}) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  return `
    <section class="activity-feed" data-component="activity-feed" aria-live="polite" aria-label="${safeTitle}">
      <header class="activity-feed-head">
        <div class="activity-feed-heading">
          <h3 class="activity-feed-title">${safeTitle}</h3>
          ${safeSubtitle ? `<p class="activity-feed-subtitle">${safeSubtitle}</p>` : ""}
        </div>
      </header>
      <ul id="activity-feed-list" class="activity-feed-list"></ul>
      <p id="activity-feed-empty" class="activity-feed-empty">No recent activity yet.</p>
    </section>
  `;
}

export function queryActivityFeedEls(root) {
  return {
    activityFeedRoot: root.querySelector("[data-component='activity-feed']"),
    activityFeedHead: root.querySelector(".activity-feed-head"),
    activityFeedList: root.querySelector("#activity-feed-list"),
    activityFeedEmpty: root.querySelector("#activity-feed-empty"),
  };
}

export function initActivityFeed(els, callbacks = {}) {
  const root = els?.activityFeedRoot;
  if (!root) return () => {};

  const onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionBtn = target.closest("[data-feed-action]");
    if (!(actionBtn instanceof HTMLButtonElement)) return;

    const action = String(actionBtn.dataset.feedAction || "").trim().toLowerCase();
    if (action === "open-note" && typeof callbacks.onOpenNote === "function") {
      const noteId = String(actionBtn.dataset.noteId || "").trim();
      if (!noteId) return;
      callbacks.onOpenNote({ noteId });
      return;
    }
    if (action === "open-task" && typeof callbacks.onOpenTask === "function") {
      const taskId = String(actionBtn.dataset.taskId || "").trim();
      callbacks.onOpenTask({ taskId });
    }
  };

  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("click", onClick);
  };
}

function formatRelativeTime(value = "") {
  const parsed = new Date(String(value || "").trim());
  if (Number.isNaN(parsed.getTime())) return "";
  const diffMs = Date.now() - parsed.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (diffMs < minuteMs) return "just now";
  if (diffMs < hourMs) return `${Math.floor(diffMs / minuteMs)}m ago`;
  if (diffMs < dayMs) return `${Math.floor(diffMs / hourMs)}h ago`;
  return `${Math.floor(diffMs / dayMs)}d ago`;
}

function normalizeRunStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "succeeded") return "succeeded";
  if (normalized === "failed") return "failed";
  if (normalized === "running") return "running";
  return normalized;
}

function buildFeedItemMarkup(item = {}) {
  const type = String(item?.type || "").trim().toLowerCase();
  const occurredAt = String(item?.occurredAt || "").trim();
  const relativeTime = formatRelativeTime(occurredAt);
  const title = escapeHtml(String(item?.title || "").trim() || "Untitled");

  if (type === "run") {
    const taskId = escapeHtml(String(item?.taskId || "").trim());
    const status = normalizeRunStatus(item?.status);
    const summary = String(item?.summary || "").trim();
    const mutationCount = Number(item?.mutationCount || 0);
    const statusLabel = status === "succeeded"
      ? "Succeeded"
      : status === "failed"
        ? "Failed"
        : status === "running"
          ? "Running"
          : "Run";
    const detailBits = [];
    if (summary) detailBits.push(summary);
    if (mutationCount > 0) detailBits.push(`${mutationCount} mutation${mutationCount === 1 ? "" : "s"}`);
    const detailText = detailBits.length ? ` • ${escapeHtml(detailBits.join(" • "))}` : "";
    const timeText = relativeTime ? ` • ${escapeHtml(relativeTime)}` : "";
    const metaMarkup = `<span class="activity-feed-run-status is-${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>${detailText}${timeText}`;
    return `
      <li class="activity-feed-item is-run">
        <div class="activity-feed-item-main">
          <p class="activity-feed-item-title">
            <span class="activity-feed-kind is-run">${renderIcon("activity", { size: 12 })}</span>
            <span class="activity-feed-item-title-text">${title}</span>
          </p>
          <p class="activity-feed-item-detail">${metaMarkup}</p>
        </div>
        <button
          type="button"
          class="activity-feed-action"
          data-feed-action="open-task"
          data-task-id="${taskId}"
          aria-label="Open automation"
        >
          ${renderIcon("chevron-right", { size: 12 })}
        </button>
      </li>
    `;
  }

  const noteId = escapeHtml(String(item?.noteId || "").trim());
  const noteType = String(item?.noteType || "").trim().toLowerCase() || "text";
  const sourceLabel = String(item?.sourceLabel || noteType || "note").trim();
  const project = String(item?.project || "").trim();
  const metaBits = [];
  if (project) metaBits.push(project);
  metaBits.push(sourceLabel);
  if (relativeTime) metaBits.push(relativeTime);
  return `
    <li class="activity-feed-item is-note">
      <div class="activity-feed-item-main">
        <p class="activity-feed-item-title">
          <span class="activity-feed-kind is-note">${renderIcon(noteTypeIconName(noteType), { size: 12 })}</span>
          <span class="activity-feed-item-title-text">${title}</span>
        </p>
        <p class="activity-feed-item-detail">${metaBits.map((bit) => escapeHtml(bit)).join(" • ")}</p>
      </div>
      <button
        type="button"
        class="activity-feed-action"
        data-feed-action="open-note"
        data-note-id="${noteId}"
        aria-label="Open note"
      >
        ${renderIcon("chevron-right", { size: 12 })}
      </button>
    </li>
  `;
}

export function renderActivityFeedItems(els, items = [], { emptyText = "No recent activity yet." } = {}) {
  const list = els?.activityFeedList;
  const empty = els?.activityFeedEmpty;
  if (!list || !empty) return;
  const entries = Array.isArray(items) ? items : [];
  list.innerHTML = entries.map((entry) => buildFeedItemMarkup(entry)).join("");
  empty.textContent = String(emptyText || "No recent activity yet.");
  empty.classList.toggle("hidden", entries.length > 0);
}
