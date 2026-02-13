/**
 * Shared toast notification system.
 * Usage: showToast("Saved!", "success", store)
 */
export function showToast(message, tone = "success", store) {
  const el = document.getElementById("toast");
  if (!el) return;

  const state = store.getState();
  el.textContent = message;
  el.classList.remove("hidden", "show", "error");
  if (tone === "error") {
    el.classList.add("error");
  }

  requestAnimationFrame(() => {
    el.classList.add("show");
  });

  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }

  const toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
    window.setTimeout(() => {
      el.classList.add("hidden");
    }, 180);
  }, 2200);

  store.setState({ toastTimer });
}
