import { renderIcon } from "../../services/icons.js";

function normalizeMode(mode = "create") {
  return String(mode || "").trim().toLowerCase() === "edit" ? "edit" : "create";
}

export function renderAutomationModalHTML() {
  return `
    <div id="automation-modal" class="automation-modal hidden" aria-hidden="true">
      <div id="automation-modal-backdrop" class="automation-modal-backdrop"></div>
      <article class="automation-modal-panel" role="dialog" aria-modal="true" aria-labelledby="automation-modal-heading">
        <button id="automation-modal-close" class="automation-modal-close" type="button" aria-label="Close">
          ${renderIcon("close", { size: 14 })}
        </button>

        <h3 id="automation-modal-heading" class="automation-modal-heading">New Automation</h3>

        <form id="automation-modal-form" class="automation-form">
          <label class="automation-form-label" for="automation-title-input">Title</label>
          <input
            id="automation-title-input"
            class="automation-input"
            type="text"
            maxlength="180"
            placeholder="e.g. Weekly folder refresh"
            autocomplete="off"
            required
          />

          <label class="automation-form-label" for="automation-prompt-input">Prompt</label>
          <textarea
            id="automation-prompt-input"
            class="automation-textarea"
            rows="4"
            maxlength="1600"
            placeholder="Describe exactly what this automation should do"
            required
          ></textarea>

          <label class="automation-form-label" for="automation-scope-folder-input">Folder Scope (Optional)</label>
          <input
            id="automation-scope-folder-input"
            class="automation-input"
            type="text"
            maxlength="120"
            placeholder="e.g. Research"
            autocomplete="off"
          />

          <div class="automation-row automation-row--two-col">
            <div>
              <label class="automation-form-label" for="automation-schedule-type">Schedule</label>
              <select id="automation-schedule-type" class="automation-select">
                <option value="manual">Manual only</option>
                <option value="interval">Every interval</option>
              </select>
            </div>
            <div id="automation-interval-wrap" class="automation-interval-wrap hidden">
              <label class="automation-form-label" for="automation-interval-input">Interval (minutes)</label>
              <input
                id="automation-interval-input"
                class="automation-input"
                type="number"
                min="5"
                max="10080"
                step="1"
                value="60"
              />
            </div>
          </div>

          <div class="automation-row automation-row--two-col">
            <div>
              <label class="automation-form-label" for="automation-max-actions-input">Max actions/run</label>
              <input
                id="automation-max-actions-input"
                class="automation-input"
                type="number"
                min="1"
                max="25"
                step="1"
                value="4"
              />
            </div>
            <div>
              <label class="automation-form-label" for="automation-max-failures-input">Auto-pause after failures</label>
              <input
                id="automation-max-failures-input"
                class="automation-input"
                type="number"
                min="1"
                max="20"
                step="1"
                value="3"
              />
            </div>
          </div>

          <label class="automation-form-label" for="automation-timezone-input">Timezone (Optional)</label>
          <input
            id="automation-timezone-input"
            class="automation-input"
            type="text"
            maxlength="80"
            placeholder="e.g. America/Los_Angeles"
          />

          <label class="automation-checkbox-row" for="automation-dry-run-input">
            <input id="automation-dry-run-input" type="checkbox" />
            <span>Dry run</span>
          </label>

          <p class="automation-hint">Agent-created automations remain pending approval until you approve them.</p>

          <div class="automation-form-actions">
            <button id="automation-modal-cancel" class="minimal-action" type="button">Cancel</button>
            <button id="automation-modal-submit" class="btn-primary" type="submit">Save</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

export function queryAutomationModalEls(root) {
  return {
    automationModal: root.querySelector("#automation-modal"),
    automationModalBackdrop: root.querySelector("#automation-modal-backdrop"),
    automationModalClose: root.querySelector("#automation-modal-close"),
    automationModalHeading: root.querySelector("#automation-modal-heading"),
    automationModalForm: root.querySelector("#automation-modal-form"),
    automationModalCancel: root.querySelector("#automation-modal-cancel"),
    automationModalSubmit: root.querySelector("#automation-modal-submit"),
    automationTitleInput: root.querySelector("#automation-title-input"),
    automationPromptInput: root.querySelector("#automation-prompt-input"),
    automationScopeFolderInput: root.querySelector("#automation-scope-folder-input"),
    automationScheduleTypeSelect: root.querySelector("#automation-schedule-type"),
    automationIntervalWrap: root.querySelector("#automation-interval-wrap"),
    automationIntervalInput: root.querySelector("#automation-interval-input"),
    automationMaxActionsInput: root.querySelector("#automation-max-actions-input"),
    automationMaxFailuresInput: root.querySelector("#automation-max-failures-input"),
    automationTimezoneInput: root.querySelector("#automation-timezone-input"),
    automationDryRunInput: root.querySelector("#automation-dry-run-input"),
  };
}

function syncIntervalVisibility(els) {
  const scheduleType = String(els?.automationScheduleTypeSelect?.value || "manual").trim().toLowerCase();
  const showInterval = scheduleType === "interval";
  if (els?.automationIntervalWrap) {
    els.automationIntervalWrap.classList.toggle("hidden", !showInterval);
  }
  if (els?.automationIntervalInput) {
    els.automationIntervalInput.disabled = !showInterval;
  }
}

function resetForm(els) {
  if (!els?.automationModalForm) return;
  els.automationModalForm.reset();
  if (els.automationScheduleTypeSelect) {
    els.automationScheduleTypeSelect.value = "manual";
  }
  if (els.automationIntervalInput) {
    els.automationIntervalInput.value = "60";
  }
  if (els.automationMaxActionsInput) {
    els.automationMaxActionsInput.value = "4";
  }
  if (els.automationMaxFailuresInput) {
    els.automationMaxFailuresInput.value = "3";
  }
  syncIntervalVisibility(els);
}

function applyDraft(els, draft = {}) {
  const mode = normalizeMode(draft.mode);
  if (els.automationModalHeading) {
    els.automationModalHeading.textContent = mode === "edit" ? "Edit Automation" : "New Automation";
  }
  if (els.automationModalSubmit) {
    els.automationModalSubmit.textContent = mode === "edit" ? "Save Changes" : "Create Automation";
  }

  if (els.automationTitleInput) {
    els.automationTitleInput.value = String(draft.title || "").trim();
  }
  if (els.automationPromptInput) {
    els.automationPromptInput.value = String(draft.prompt || draft.title || "").trim();
  }
  if (els.automationScopeFolderInput) {
    els.automationScopeFolderInput.value = String(draft.scopeFolder || draft.project || "").trim();
  }

  if (els.automationScheduleTypeSelect) {
    const scheduleType = String(draft.scheduleType || "manual").trim().toLowerCase();
    els.automationScheduleTypeSelect.value = scheduleType === "interval" ? "interval" : "manual";
  }
  if (els.automationIntervalInput) {
    const value = Number(draft.intervalMinutes);
    els.automationIntervalInput.value = Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : "60";
  }
  if (els.automationMaxActionsInput) {
    const value = Number(draft.maxActionsPerRun);
    els.automationMaxActionsInput.value = Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : "4";
  }
  if (els.automationMaxFailuresInput) {
    const value = Number(draft.maxConsecutiveFailures);
    els.automationMaxFailuresInput.value = Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : "3";
  }
  if (els.automationTimezoneInput) {
    els.automationTimezoneInput.value = String(draft.timezone || "").trim();
  }
  if (els.automationDryRunInput) {
    els.automationDryRunInput.checked = draft.dryRun === true;
  }

  syncIntervalVisibility(els);
}

export function readAutomationModalDraft(els) {
  const title = String(els?.automationTitleInput?.value || "").trim();
  const prompt = String(els?.automationPromptInput?.value || "").trim();
  const scopeFolder = String(els?.automationScopeFolderInput?.value || "").trim();
  const scheduleType = String(els?.automationScheduleTypeSelect?.value || "manual").trim().toLowerCase();

  const intervalRaw = Number(els?.automationIntervalInput?.value || 0);
  const intervalMinutes =
    scheduleType === "interval" && Number.isFinite(intervalRaw) && intervalRaw > 0
      ? Math.max(5, Math.min(10080, Math.floor(intervalRaw)))
      : undefined;

  const maxActionsRaw = Number(els?.automationMaxActionsInput?.value || 4);
  const maxActionsPerRun = Number.isFinite(maxActionsRaw) && maxActionsRaw > 0
    ? Math.max(1, Math.min(25, Math.floor(maxActionsRaw)))
    : 4;
  const maxFailuresRaw = Number(els?.automationMaxFailuresInput?.value || 3);
  const maxConsecutiveFailures = Number.isFinite(maxFailuresRaw) && maxFailuresRaw > 0
    ? Math.max(1, Math.min(20, Math.floor(maxFailuresRaw)))
    : 3;

  return {
    title,
    prompt: prompt || title,
    scopeFolder,
    scheduleType: scheduleType === "interval" ? "interval" : "manual",
    intervalMinutes,
    maxActionsPerRun,
    maxConsecutiveFailures,
    timezone: String(els?.automationTimezoneInput?.value || "").trim(),
    dryRun: els?.automationDryRunInput?.checked === true,
  };
}

export function openAutomationModal(els, draft = {}) {
  if (!els?.automationModal) return;

  resetForm(els);
  applyDraft(els, draft);

  els.automationModal.dataset.mode = normalizeMode(draft.mode);
  els.automationModal.dataset.taskId = String(draft.taskId || "").trim();
  els.automationModal.classList.remove("hidden");
  els.automationModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.automationTitleInput?.focus();
}

export function closeAutomationModal(els) {
  if (!els?.automationModal) return;
  els.automationModal.classList.add("hidden");
  els.automationModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function setAutomationModalLoading(els, loading) {
  const isLoading = loading === true;
  const controls = [
    els?.automationModalClose,
    els?.automationModalCancel,
    els?.automationModalSubmit,
    els?.automationTitleInput,
    els?.automationPromptInput,
    els?.automationScopeFolderInput,
    els?.automationScheduleTypeSelect,
    els?.automationIntervalInput,
    els?.automationMaxActionsInput,
    els?.automationMaxFailuresInput,
    els?.automationTimezoneInput,
    els?.automationDryRunInput,
  ];
  controls.forEach((entry) => {
    if (entry && "disabled" in entry) {
      entry.disabled = isLoading;
    }
  });
}

export function initAutomationModal(els, callbacks = {}) {
  const disposers = [];

  function on(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    disposers.push(() => target.removeEventListener(eventName, handler));
  }

  on(els?.automationModalClose, "click", () => callbacks.onClose?.());
  on(els?.automationModalBackdrop, "click", () => callbacks.onClose?.());
  on(els?.automationModalCancel, "click", () => callbacks.onClose?.());

  on(els?.automationScheduleTypeSelect, "change", () => {
    syncIntervalVisibility(els);
  });

  on(els?.automationModal, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      callbacks.onClose?.();
    }
  });

  on(els?.automationModalForm, "submit", async (event) => {
    event.preventDefault();
    const mode = normalizeMode(els?.automationModal?.dataset?.mode);
    const taskId = String(els?.automationModal?.dataset?.taskId || "").trim();
    const draft = readAutomationModalDraft(els);
    await callbacks.onSubmit?.({
      mode,
      taskId,
      draft,
    });
  });

  return () => {
    disposers.forEach((dispose) => dispose());
  };
}
