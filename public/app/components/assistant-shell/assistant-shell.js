import { renderComposer } from "../composer/composer.js";

function normalizeMode(value) {
  return value === "ask" ? "ask" : "save";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAssistantShellHTML({
  captureMode = "home",
  mode = "save",
  contextLabel = "All notes",
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const safeContextLabel = escapeHtml(contextLabel || "All notes");

  return `
    <section class="assistant-shell" data-component="assistant-shell">
      <div class="assistant-shell-rail">
        <div class="assistant-mode-toggle" role="tablist" aria-label="Assistant mode">
          <button
            id="assistant-mode-save"
            class="assistant-mode-btn${normalizedMode === "save" ? " is-active" : ""}"
            type="button"
            role="tab"
            aria-selected="${normalizedMode === "save" ? "true" : "false"}"
            data-mode="save"
          >
            Save
          </button>
          <button
            id="assistant-mode-ask"
            class="assistant-mode-btn${normalizedMode === "ask" ? " is-active" : ""}"
            type="button"
            role="tab"
            aria-selected="${normalizedMode === "ask" ? "true" : "false"}"
            data-mode="ask"
          >
            Ask
          </button>
        </div>
        <p id="assistant-context-chip" class="assistant-context-chip" aria-live="polite">${safeContextLabel}</p>
      </div>

      <div id="assistant-save-pane" class="assistant-pane assistant-pane--save">
        ${renderComposer({ mode: captureMode })}
      </div>
    </section>
  `;
}

export function queryAssistantShellEls(root) {
  return {
    assistantShell: root.querySelector(".assistant-shell"),
    assistantModeSaveBtn: root.querySelector("#assistant-mode-save"),
    assistantModeAskBtn: root.querySelector("#assistant-mode-ask"),
    assistantContextChip: root.querySelector("#assistant-context-chip"),
    assistantSavePane: root.querySelector("#assistant-save-pane"),
  };
}

export function initAssistantShell(
  els,
  { initialMode = "save", initialContextLabel = "All notes", onModeChange } = {}
) {
  const handlers = [];
  let mode = normalizeMode(initialMode);

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  function applyMode(nextMode, { emit = true } = {}) {
    mode = normalizeMode(nextMode);
    const isSave = mode === "save";

    if (els.assistantShell) {
      els.assistantShell.classList.toggle("is-ask-mode", !isSave);
      els.assistantShell.classList.toggle("is-save-mode", isSave);
    }

    if (els.assistantSavePane) {
      els.assistantSavePane.classList.remove("hidden");
    }

    if (els.assistantModeSaveBtn) {
      els.assistantModeSaveBtn.classList.toggle("is-active", isSave);
      els.assistantModeSaveBtn.setAttribute("aria-selected", isSave ? "true" : "false");
    }
    if (els.assistantModeAskBtn) {
      els.assistantModeAskBtn.classList.toggle("is-active", !isSave);
      els.assistantModeAskBtn.setAttribute("aria-selected", isSave ? "false" : "true");
    }

    if (emit && typeof onModeChange === "function") {
      onModeChange(mode);
    }
  }

  function setContextLabel(label) {
    if (!els.assistantContextChip) return;
    const text = String(label || "").trim() || "All notes";
    els.assistantContextChip.textContent = text;
  }

  addHandler(els.assistantModeSaveBtn, "click", () => applyMode("save"));
  addHandler(els.assistantModeAskBtn, "click", () => applyMode("ask"));

  setContextLabel(initialContextLabel);
  applyMode(mode, { emit: false });

  return {
    getMode() {
      return mode;
    },
    setMode(nextMode, options) {
      applyMode(nextMode, options);
    },
    setContextLabel,
    dispose() {
      handlers.forEach((dispose) => dispose());
    },
  };
}
