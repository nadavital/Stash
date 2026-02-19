import {
  initAuthGate,
  queryAuthGateEls,
  renderAuthGateHTML,
} from "./components/auth-gate/auth-gate.js";
import {
  renderAppShellHTML,
  queryAppShellEls,
  initAppShell,
} from "./components/app-shell/app-shell.js";
import { createFolderPage } from "./pages/folder-page.js";
import { createHomePage } from "./pages/home-page.js";
import { createItemPage } from "./pages/item-page.js";
import { createRouter } from "./router.js";
import { createApiClient } from "./services/api-client.js";
import {
  clearPersistedChatState,
  getBrowserStorage,
  loadPersistedChatState,
  savePersistedChatState,
} from "./services/chat-persistence.js";
import { createStore } from "./state/store.js";

const mountNode = document.getElementById("app-root");

if (!mountNode) {
  throw new Error("Missing #app-root mount node");
}

const store = createStore();
const apiClient = createApiClient({ adapterDebug: false });

const authContext = {
  session: null,
};

let router = null;
let disposeAuthGate = null;
let disposeShell = null;
let disposeChatPersistence = null;

function stopChatPersistence() {
  if (typeof disposeChatPersistence === "function") {
    disposeChatPersistence();
    disposeChatPersistence = null;
  }
}

function hydrateChatFromStorage(session) {
  const storage = getBrowserStorage();
  const restored = loadPersistedChatState(storage, session);
  store.setState({
    chatMessages: restored?.chatMessages || [],
    chatCitations: restored?.chatCitations || [],
  });
}

function startChatPersistence(session) {
  stopChatPersistence();

  const storage = getBrowserStorage();
  if (!storage) return;

  let prevMessages = store.getState().chatMessages;
  let prevCitations = store.getState().chatCitations;

  savePersistedChatState(storage, session, {
    chatMessages: prevMessages,
    chatCitations: prevCitations,
  });

  const unsubscribe = store.subscribe((nextState) => {
    if (nextState.chatMessages === prevMessages && nextState.chatCitations === prevCitations) {
      return;
    }

    prevMessages = nextState.chatMessages;
    prevCitations = nextState.chatCitations;

    savePersistedChatState(storage, session, {
      chatMessages: nextState.chatMessages,
      chatCitations: nextState.chatCitations,
    });
  });

  disposeChatPersistence = () => {
    unsubscribe();
  };
}

function getAuthSession() {
  return authContext.session;
}

async function handleSignOut() {
  const currentSession = getAuthSession();
  clearPersistedChatState(getBrowserStorage(), currentSession);
  stopChatPersistence();
  apiClient.logout();
  authContext.session = null;
  store.setState({
    accessedIds: [],
    chatMessages: [],
    chatCitations: [],
    chatContext: { type: "home" },
  });
  mountAuthGate();
}

function mountAppShell() {
  if (typeof disposeAuthGate === "function") {
    disposeAuthGate();
    disposeAuthGate = null;
  }

  if (router) {
    router.stop();
    router = null;
  }

  stopChatPersistence();

  if (typeof disposeShell === "function") {
    disposeShell();
    disposeShell = null;
  }

  const auth = {
    getSession: getAuthSession,
    onSignOut: handleSignOut,
  };

  const authSession = getAuthSession();
  hydrateChatFromStorage(authSession);

  // Render persistent app shell
  mountNode.innerHTML = renderAppShellHTML({ auth: authSession });
  const shellEls = queryAppShellEls(mountNode);
  const shell = initAppShell(shellEls, { store, apiClient, auth });
  disposeShell = shell.dispose;
  startChatPersistence(authSession);

  const contentSlot = shell.getContentSlot();

  const pages = {
    home: createHomePage({ store, apiClient, auth, shell }),
    folder: createFolderPage({ store, apiClient, auth, shell }),
    item: createItemPage({ store, apiClient, auth, shell }),
  };

  router = createRouter({
    mountNode: contentSlot,
    pages,
    onRouteChange(route) {
      shell.updateContext(route);
    },
  });

  router.start();
}

function mountAuthGate({ mode = "signin", email = "", name = "", error = "" } = {}) {
  if (typeof disposeAuthGate === "function") {
    disposeAuthGate();
    disposeAuthGate = null;
  }

  if (router) {
    router.stop();
    router = null;
  }

  stopChatPersistence();

  if (typeof disposeShell === "function") {
    disposeShell();
    disposeShell = null;
  }

  mountNode.innerHTML = renderAuthGateHTML({
    mode,
    email,
    name,
    error,
  });

  const els = queryAuthGateEls(mountNode);
  disposeAuthGate = initAuthGate(els, {
    async onSubmit(credentials) {
      const session = credentials.mode === "signup"
        ? await apiClient.signup(credentials)
        : await apiClient.login(credentials);
      if (session.requiresEmailVerification) {
        authContext.session = null;
        mountAuthGate({
          mode: "signin",
          email: credentials.email,
          error: "Email verification required. Check your inbox, then sign in again.",
        });
        return;
      }
      authContext.session = {
        userId: session.userId,
        userEmail: session.userEmail,
        userName: session.userName || "",
        workspaceId: session.workspaceId,
        workspaceName: session.workspaceName,
        workspaceSlug: session.workspaceSlug || "",
        role: session.role,
      };
      mountAppShell();
    },
    async onForgotPassword({ email }) {
      await apiClient.requestPasswordReset({ email });
    },
  });
}

async function bootstrap() {
  try {
    const actor = await apiClient.fetchSession();
    if (actor) {
      if (actor.requiresEmailVerification) {
        mountAuthGate({
          mode: "signin",
          email: actor.userEmail || "",
          error: "Email verification required. Please verify your email to continue.",
        });
        return;
      }
      authContext.session = actor;
      mountAppShell();
      return;
    }
  } catch (error) {
    mountAuthGate({
      error: error instanceof Error ? error.message : "Could not validate existing session",
    });
    return;
  }

  mountAuthGate();
}

bootstrap();
