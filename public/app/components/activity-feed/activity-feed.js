function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderActivityFeedHTML({
  title = "Activity",
} = {}) {
  const safeTitle = escapeHtml(title);
  return `
    <section class="activity-feed" data-component="activity-feed" aria-live="polite">
      <header class="activity-feed-head">
        <h3 class="activity-feed-title">${safeTitle}</h3>
      </header>
      <ul id="activity-feed-list" class="activity-feed-list"></ul>
      <p id="activity-feed-empty" class="activity-feed-empty">No recent activity.</p>
    </section>
  `;
}

export function queryActivityFeedEls(root) {
  return {
    activityFeedRoot: root.querySelector("[data-component='activity-feed']"),
    activityFeedList: root.querySelector("#activity-feed-list"),
    activityFeedEmpty: root.querySelector("#activity-feed-empty"),
  };
}

export function initActivityFeed() {
  return () => {};
}

export function renderActivityFeedItems(els, items = []) {
  const list = els?.activityFeedList;
  const empty = els?.activityFeedEmpty;
  if (!list || !empty) return;
  const entries = Array.isArray(items) ? items : [];
  list.innerHTML = "";
  for (const entry of entries) {
    const actorName = escapeHtml(String(entry?.actorName || "").trim() || "Unknown user");
    const message = escapeHtml(String(entry?.message || "").trim() || "updated workspace");
    const createdAt = String(entry?.createdAt || "").trim();
    const timestamp = createdAt ? new Date(createdAt).toLocaleString() : "";
    const li = document.createElement("li");
    li.className = "activity-feed-item";
    li.innerHTML = `
      <div class="activity-feed-line">
        <span class="activity-feed-actor">${actorName}</span>
        <span class="activity-feed-message">${message}</span>
      </div>
      ${timestamp ? `<time class="activity-feed-time">${escapeHtml(timestamp)}</time>` : ""}
    `;
    list.appendChild(li);
  }
  empty.classList.toggle("hidden", entries.length > 0);
}
