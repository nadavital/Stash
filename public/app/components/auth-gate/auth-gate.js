function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getModeCopy(mode) {
  const isSignUp = mode === "signup";
  return {
    title: isSignUp ? "Create your account" : "Sign in to Stash",
    subtitle: isSignUp
      ? "Use your email and a password to create your account."
      : "Use your email and password to continue.",
    submitIdle: isSignUp ? "Create account" : "Sign in",
    submitLoading: isSignUp ? "Creating account..." : "Signing in...",
    switchPrompt: isSignUp ? "Already have an account?" : "New to Stash?",
    switchAction: isSignUp ? "Sign in" : "Create account",
    showSignUpFields: isSignUp,
    showForgotPassword: !isSignUp,
  };
}

export function renderAuthGateHTML({
  mode = "signin",
  email = "",
  name = "",
  error = "",
  loading = false,
} = {}) {
  const normalizedMode = mode === "signup" ? "signup" : "signin";
  const copy = getModeCopy(normalizedMode);
  const safeEmail = escapeHtml(email);
  const safeName = escapeHtml(name);
  const safeError = escapeHtml(error);

  return `
    <section class="auth-gate" data-component="auth-gate">
      <div class="auth-gate-card">
        <p class="auth-gate-kicker">Stash</p>
        <h1 id="auth-gate-title" class="auth-gate-title">${escapeHtml(copy.title)}</h1>
        <p id="auth-gate-subtitle" class="auth-gate-subtitle">${escapeHtml(copy.subtitle)}</p>

        <form id="auth-gate-form" class="auth-gate-form" novalidate>
          <input id="auth-mode-input" type="hidden" name="mode" value="${normalizedMode}" />

          <label class="auth-gate-label" for="auth-email-input">Email</label>
          <input
            id="auth-email-input"
            class="auth-gate-input"
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            value="${safeEmail}"
          />

          <div id="auth-signup-name-field" class="${copy.showSignUpFields ? "" : "hidden"}">
            <label class="auth-gate-label" for="auth-name-input">Name (optional)</label>
            <input
              id="auth-name-input"
              class="auth-gate-input"
              type="text"
              name="name"
              autocomplete="name"
              placeholder="Your name"
              value="${safeName}"
            />
          </div>

          <label class="auth-gate-label" for="auth-password-input">Password</label>
          <input
            id="auth-password-input"
            class="auth-gate-input"
            type="password"
            name="password"
            required
            minlength="8"
            autocomplete="${copy.showSignUpFields ? "new-password" : "current-password"}"
            placeholder="At least 8 characters"
          />

          <div id="auth-signup-confirm-field" class="${copy.showSignUpFields ? "" : "hidden"}">
            <label class="auth-gate-label" for="auth-password-confirm-input">Confirm password</label>
            <input
              id="auth-password-confirm-input"
              class="auth-gate-input"
              type="password"
              name="passwordConfirm"
              ${copy.showSignUpFields ? "required" : ""}
              minlength="8"
              autocomplete="new-password"
              placeholder="Repeat your password"
            />
          </div>

          <button
            id="auth-forgot-password-btn"
            class="auth-gate-forgot${copy.showForgotPassword ? "" : " hidden"}"
            type="button"
          >
            Forgot password?
          </button>

          <p id="auth-gate-error" class="auth-gate-error${safeError ? "" : " hidden"}" role="alert">${safeError || ""}</p>
          <p id="auth-gate-info" class="auth-gate-info hidden" aria-live="polite"></p>

          <button id="auth-gate-submit" class="auth-gate-submit" type="submit"${loading ? " disabled" : ""}>
            ${loading ? escapeHtml(copy.submitLoading) : escapeHtml(copy.submitIdle)}
          </button>
        </form>

        <div class="auth-gate-switch">
          <p id="auth-gate-switch-prompt" class="auth-gate-switch-prompt">${escapeHtml(copy.switchPrompt)}</p>
          <button id="auth-gate-mode-toggle" type="button" class="auth-gate-mode-toggle">${escapeHtml(copy.switchAction)}</button>
        </div>
      </div>
    </section>
  `;
}

export function queryAuthGateEls(root) {
  return {
    form: root.querySelector("#auth-gate-form"),
    modeInput: root.querySelector("#auth-mode-input"),
    title: root.querySelector("#auth-gate-title"),
    subtitle: root.querySelector("#auth-gate-subtitle"),
    emailInput: root.querySelector("#auth-email-input"),
    passwordInput: root.querySelector("#auth-password-input"),
    nameInput: root.querySelector("#auth-name-input"),
    passwordConfirmInput: root.querySelector("#auth-password-confirm-input"),
    forgotPasswordButton: root.querySelector("#auth-forgot-password-btn"),
    signupFields: root.querySelector("#auth-signup-name-field"),
    signupConfirmField: root.querySelector("#auth-signup-confirm-field"),
    error: root.querySelector("#auth-gate-error"),
    info: root.querySelector("#auth-gate-info"),
    submit: root.querySelector("#auth-gate-submit"),
    switchPrompt: root.querySelector("#auth-gate-switch-prompt"),
    modeToggle: root.querySelector("#auth-gate-mode-toggle"),
  };
}

export function initAuthGate(els, { onSubmit, onForgotPassword } = {}) {
  let disposed = false;
  let mode = els.modeInput?.value === "signup" ? "signup" : "signin";

  function setLoading(loading) {
    if (!els.submit) return;
    const active = Boolean(loading);
    const copy = getModeCopy(mode);
    els.submit.disabled = active;
    els.submit.textContent = active ? copy.submitLoading : copy.submitIdle;
  }

  function setError(message) {
    if (!els.error) return;
    const text = String(message || "").trim();
    els.error.textContent = text;
    els.error.classList.toggle("hidden", !text);
  }

  function setInfo(message) {
    if (!els.info) return;
    const text = String(message || "").trim();
    els.info.textContent = text;
    els.info.classList.toggle("hidden", !text);
  }

  function applyMode(nextMode) {
    mode = nextMode === "signup" ? "signup" : "signin";
    if (els.modeInput) {
      els.modeInput.value = mode;
    }

    const copy = getModeCopy(mode);
    if (els.title) els.title.textContent = copy.title;
    if (els.subtitle) els.subtitle.textContent = copy.subtitle;
    if (els.switchPrompt) els.switchPrompt.textContent = copy.switchPrompt;
    if (els.modeToggle) els.modeToggle.textContent = copy.switchAction;
    if (els.signupFields) els.signupFields.classList.toggle("hidden", !copy.showSignUpFields);
    if (els.passwordConfirmInput) {
      els.passwordConfirmInput.required = copy.showSignUpFields;
      if (!copy.showSignUpFields) {
        els.passwordConfirmInput.value = "";
      }
    }
    if (els.passwordInput) {
      els.passwordInput.autocomplete = copy.showSignUpFields ? "new-password" : "current-password";
    }
    if (els.forgotPasswordButton) {
      els.forgotPasswordButton.classList.toggle("hidden", !copy.showForgotPassword);
    }
    if (els.signupConfirmField) {
      els.signupConfirmField.classList.toggle("hidden", !copy.showSignUpFields);
    }
    setLoading(false);
    setError("");
    setInfo("");
  }

  function handleToggleMode() {
    if (disposed) return;
    applyMode(mode === "signup" ? "signin" : "signup");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (disposed) return;

    const email = String(els.emailInput?.value || "").trim();
    const password = String(els.passwordInput?.value || "");
    const name = String(els.nameInput?.value || "").trim();
    const passwordConfirm = String(els.passwordConfirmInput?.value || "");

    if (!email) {
      setError("Email is required");
      els.emailInput?.focus();
      return;
    }
    if (!password) {
      setError("Password is required");
      els.passwordInput?.focus();
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      els.passwordInput?.focus();
      return;
    }
    if (mode === "signup" && password !== passwordConfirm) {
      setError("Passwords do not match");
      els.passwordConfirmInput?.focus();
      return;
    }

    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (typeof onSubmit === "function") {
        await onSubmit({ mode, email, password, name });
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  async function handleForgotPassword() {
    if (disposed || typeof onForgotPassword !== "function") return;
    const email = String(els.emailInput?.value || "").trim();
    if (!email) {
      setError("Enter your email first, then click Forgot password");
      els.emailInput?.focus();
      return;
    }

    setError("");
    setInfo("");
    setLoading(true);
    try {
      await onForgotPassword({ email });
      setInfo("Password reset email sent. Check your inbox.");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  els.form?.addEventListener("submit", handleSubmit);
  els.modeToggle?.addEventListener("click", handleToggleMode);
  els.forgotPasswordButton?.addEventListener("click", handleForgotPassword);
  applyMode(mode);

  return function dispose() {
    disposed = true;
    els.form?.removeEventListener("submit", handleSubmit);
    els.modeToggle?.removeEventListener("click", handleToggleMode);
    els.forgotPasswordButton?.removeEventListener("click", handleForgotPassword);
  };
}
