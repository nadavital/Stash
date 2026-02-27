export function createChatSourcePanels({
  chatPanelCitationsEl = null,
  chatPanelWebSourcesEl = null,
  onOpenCitation = null,
  buildNoteTitle = null,
  normalizeCitation = null,
  normalizeCitationLabel = null,
  renderIcon = null,
  maxSourceListItems = 8,
  maxInlineSourceChips = 3,
} = {}) {
  const sourcePanelState = {
    citationsExpanded: false,
    webExpanded: false,
  };

  const getNoteTitle = typeof buildNoteTitle === "function"
    ? buildNoteTitle
    : (note) => String(note?.title || "Untitled");
  const toCitation = typeof normalizeCitation === "function"
    ? normalizeCitation
    : (entry) => entry;
  const toCitationLabel = typeof normalizeCitationLabel === "function"
    ? normalizeCitationLabel
    : (label) => String(label || "").trim().toUpperCase();
  const toIcon = typeof renderIcon === "function"
    ? renderIcon
    : () => "";

  function normalizeWebSourceEntries(sources = []) {
    return Array.isArray(sources)
      ? sources
          .map((entry) => ({
            url: String(entry?.url || "").trim(),
            title: String(entry?.title || "").trim(),
          }))
          .filter((entry) => entry.url)
          .slice(0, maxSourceListItems)
      : [];
  }

  function getSourceHostname(url = "") {
    try {
      return new URL(String(url || "")).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function getSourceFaviconUrl(url = "") {
    const normalized = String(url || "").trim();
    if (!normalized) return "";
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(normalized)}&sz=64`;
  }

  function createFaviconStack(urls = [], fallbackLabel = "S") {
    const stack = document.createElement("div");
    stack.className = "chat-source-stack";
    const normalizedUrls = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 3) : [];
    if (normalizedUrls.length === 0) {
      const fallback = document.createElement("span");
      fallback.className = "chat-source-stack-item chat-source-stack-fallback";
      fallback.textContent = String(fallbackLabel || "S").slice(0, 1).toUpperCase();
      stack.appendChild(fallback);
      return stack;
    }
    normalizedUrls.forEach((url, index) => {
      const item = document.createElement("span");
      item.className = "chat-source-stack-item";
      item.style.zIndex = String(20 - index);
      const img = document.createElement("img");
      img.className = "chat-source-favicon";
      img.src = getSourceFaviconUrl(url);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      item.appendChild(img);
      stack.appendChild(item);
    });
    return stack;
  }

  function renderSourceToggle(container, {
    label = "Sources",
    count = 0,
    urls = [],
    expanded = false,
    onToggle = null,
  } = {}) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "chat-source-toggle";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.addEventListener("click", () => {
      if (typeof onToggle === "function") onToggle();
    });

    const left = document.createElement("span");
    left.className = "chat-source-toggle-left";
    left.append(
      createFaviconStack(urls, label.slice(0, 1)),
      Object.assign(document.createElement("span"), {
        className: "chat-source-toggle-label",
        textContent: label,
      }),
      Object.assign(document.createElement("span"), {
        className: "chat-source-toggle-count",
        textContent: String(Math.max(0, Number(count) || 0)),
      })
    );

    const chevron = document.createElement("span");
    chevron.className = `chat-source-toggle-chevron${expanded ? " is-expanded" : ""}`;
    chevron.innerHTML = toIcon("chevron-right", { size: 14, strokeWidth: 2 });

    toggle.append(left, chevron);
    container.appendChild(toggle);
  }

  function renderCitations(citations = []) {
    if (!chatPanelCitationsEl) return;
    const normalized = Array.isArray(citations)
      ? citations.map((entry, index) => toCitation(entry, index)).slice(0, maxSourceListItems)
      : [];
    chatPanelCitationsEl.innerHTML = "";
    if (!normalized.length) {
      chatPanelCitationsEl.classList.add("hidden");
      sourcePanelState.citationsExpanded = false;
      return;
    }

    chatPanelCitationsEl.classList.remove("hidden");
    const sourceUrls = normalized
      .map((entry) => String(entry?.note?.sourceUrl || "").trim())
      .filter(Boolean);
    renderSourceToggle(chatPanelCitationsEl, {
      label: "Saved sources",
      count: normalized.length,
      urls: sourceUrls,
      expanded: sourcePanelState.citationsExpanded,
      onToggle: () => {
        sourcePanelState.citationsExpanded = !sourcePanelState.citationsExpanded;
        renderCitations(normalized);
      },
    });

    if (!sourcePanelState.citationsExpanded) return;
    const list = document.createElement("div");
    list.className = "chat-source-list";
    normalized.forEach((citation) => {
      const note = citation.note || {};
      const item = document.createElement("article");
      item.className = "chat-source-item";

      const row = document.createElement("div");
      row.className = "chat-source-item-row";

      const title = document.createElement("button");
      title.type = "button";
      title.className = "chat-source-title";
      title.textContent = getNoteTitle(note);
      title.title = getNoteTitle(note);
      title.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") onOpenCitation(note);
      });

      const meta = document.createElement("span");
      meta.className = "chat-source-meta";
      meta.textContent = String(note.project || note.sourceType || "Saved item");
      row.append(title, meta);
      item.appendChild(row);

      const actions = document.createElement("div");
      actions.className = "chat-source-actions";
      const openInAppBtn = document.createElement("button");
      openInAppBtn.type = "button";
      openInAppBtn.className = "chat-source-action";
      openInAppBtn.textContent = "Open";
      openInAppBtn.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") onOpenCitation(note);
      });
      actions.appendChild(openInAppBtn);

      const sourceUrl = String(note.sourceUrl || "").trim();
      if (sourceUrl) {
        const openSourceBtn = document.createElement("a");
        openSourceBtn.className = "chat-source-action";
        openSourceBtn.href = sourceUrl;
        openSourceBtn.target = "_blank";
        openSourceBtn.rel = "noopener noreferrer";
        openSourceBtn.innerHTML = `${toIcon("external-link", { size: 12, strokeWidth: 2 })}<span>Source</span>`;
        actions.appendChild(openSourceBtn);
      }

      item.appendChild(actions);
      list.appendChild(item);
    });

    chatPanelCitationsEl.appendChild(list);
  }

  function renderWebSources(sources = []) {
    if (!chatPanelWebSourcesEl) return;
    const normalized = normalizeWebSourceEntries(sources);
    chatPanelWebSourcesEl.innerHTML = "";
    if (!normalized.length) {
      chatPanelWebSourcesEl.classList.add("hidden");
      sourcePanelState.webExpanded = false;
      return;
    }

    chatPanelWebSourcesEl.classList.remove("hidden");
    renderSourceToggle(chatPanelWebSourcesEl, {
      label: "Web sources",
      count: normalized.length,
      urls: normalized.map((entry) => entry.url),
      expanded: sourcePanelState.webExpanded,
      onToggle: () => {
        sourcePanelState.webExpanded = !sourcePanelState.webExpanded;
        renderWebSources(normalized);
      },
    });

    if (!sourcePanelState.webExpanded) return;
    const list = document.createElement("div");
    list.className = "chat-source-list";

    normalized.forEach((entry) => {
      const host = getSourceHostname(entry.url);
      const link = document.createElement("a");
      link.className = "chat-source-link";
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = entry.url;

      const favicon = document.createElement("img");
      favicon.className = "chat-source-link-favicon";
      favicon.src = getSourceFaviconUrl(entry.url);
      favicon.alt = "";
      favicon.loading = "lazy";
      favicon.decoding = "async";

      const text = document.createElement("span");
      text.className = "chat-source-link-text";
      const title = document.createElement("span");
      title.className = "chat-source-title";
      title.textContent = entry.title || host || entry.url;
      const meta = document.createElement("span");
      meta.className = "chat-source-meta";
      meta.textContent = host || entry.url;
      text.append(title, meta);

      const icon = document.createElement("span");
      icon.className = "chat-source-link-icon";
      icon.innerHTML = toIcon("external-link", { size: 12, strokeWidth: 2 });

      link.append(favicon, text, icon);
      list.appendChild(link);
    });

    chatPanelWebSourcesEl.appendChild(list);
  }

  function renderInlineSourceChips(msgEl, { citations = [], webSources = [] } = {}) {
    if (!msgEl) return;
    msgEl.querySelector(".chat-inline-sources")?.remove();

    const normalizedWeb = normalizeWebSourceEntries(webSources);
    const normalizedCitations = Array.isArray(citations)
      ? citations.map((entry, index) => toCitation(entry, index)).slice(0, maxInlineSourceChips)
      : [];
    const chips = [];
    const seen = new Set();

    normalizedWeb.slice(0, maxInlineSourceChips).forEach((entry) => {
      const key = `web:${entry.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      chips.push({
        kind: "web",
        url: entry.url,
        label: getSourceHostname(entry.url) || entry.title || entry.url,
      });
    });

    if (chips.length < maxInlineSourceChips) {
      normalizedCitations.forEach((entry) => {
        if (chips.length >= maxInlineSourceChips) return;
        const note = entry.note || {};
        const noteId = String(note.id || "");
        if (!noteId || seen.has(`note:${noteId}`)) return;
        seen.add(`note:${noteId}`);
        chips.push({
          kind: "note",
          note,
          label: getNoteTitle(note),
        });
      });
    }

    if (!chips.length) return;
    const wrap = document.createElement("div");
    wrap.className = "chat-inline-sources";

    chips.forEach((chip) => {
      if (chip.kind === "web") {
        const anchor = document.createElement("a");
        anchor.className = "chat-inline-source-chip";
        anchor.href = chip.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        const favicon = document.createElement("img");
        favicon.className = "chat-inline-source-favicon";
        favicon.src = getSourceFaviconUrl(chip.url);
        favicon.alt = "";
        favicon.loading = "lazy";
        favicon.decoding = "async";
        const label = document.createElement("span");
        label.textContent = chip.label;
        anchor.append(favicon, label);
        wrap.appendChild(anchor);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-inline-source-chip";
      button.textContent = chip.label;
      button.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") onOpenCitation(chip.note);
      });
      wrap.appendChild(button);
    });

    msgEl.appendChild(wrap);
  }

  function extractCitationLabelsFromText(text, max = 12) {
    const labels = [];
    const seen = new Set();
    const matcher = /\[?(N\d+)\]?/gi;
    let match = matcher.exec(String(text || ""));
    while (match && labels.length < max) {
      const label = toCitationLabel(match[1]);
      if (label && !seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
      match = matcher.exec(String(text || ""));
    }
    return labels;
  }

  function resolveVisibleCitations(citations = [], assistantText = "", usedLabels = []) {
    const normalizedCitations = Array.isArray(citations)
      ? citations.map((entry, index) => toCitation(entry, index))
      : [];
    if (!normalizedCitations.length) return [];
    const text = String(assistantText || "").trim();
    if (!text) return [];

    const textLabels = extractCitationLabelsFromText(text, normalizedCitations.length);
    const explicitLabels = Array.isArray(usedLabels)
      ? usedLabels.map((label) => toCitationLabel(label)).filter(Boolean)
      : [];
    const preferredLabels = new Set([...explicitLabels, ...textLabels]);
    if (preferredLabels.size > 0) {
      return normalizedCitations.filter((entry) => preferredLabels.has(entry.label)).slice(0, 6);
    }

    const textLower = text.toLowerCase();
    const titleMatchedLabels = new Set();
    normalizedCitations.forEach((entry) => {
      const title = getNoteTitle(entry.note || {}).trim().toLowerCase();
      if (title.length >= 4 && textLower.includes(title)) {
        titleMatchedLabels.add(entry.label);
      }
    });

    if (titleMatchedLabels.size > 0) {
      return normalizedCitations.filter((entry) => titleMatchedLabels.has(entry.label)).slice(0, 6);
    }
    return [];
  }

  function resolveVisibleWebSources(sources = [], assistantText = "") {
    const normalized = normalizeWebSourceEntries(sources).slice(0, 8);
    if (!normalized.length) return [];
    const textLower = String(assistantText || "").toLowerCase().trim();
    if (!textLower) return [];

    return normalized.filter((entry) => {
      const title = entry.title.toLowerCase();
      let host = "";
      try {
        host = new URL(entry.url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        host = "";
      }
      return (
        (title.length >= 5 && textLower.includes(title))
        || (host.length >= 4 && textLower.includes(host))
        || textLower.includes(entry.url.toLowerCase())
      );
    });
  }

  return {
    renderCitations,
    renderWebSources,
    renderInlineSourceChips,
    resolveVisibleCitations,
    resolveVisibleWebSources,
    resetSourceState() {
      sourcePanelState.citationsExpanded = false;
      sourcePanelState.webExpanded = false;
    },
  };
}
