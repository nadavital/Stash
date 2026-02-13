function parseRouteFromHash(hash) {
  const normalized = String(hash || "")
    .replace(/^#/, "")
    .trim();

  if (!normalized || normalized === "/") {
    return { name: "home" };
  }

  const parts = normalized
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));

  if (parts[0] === "folder") {
    return {
      name: "folder",
      folderId: parts[1] || "general",
    };
  }

  return { name: "home" };
}

export function createRouter({ mountNode, pages }) {
  let activeCleanup = null;
  let started = false;

  function navigate(nextHash) {
    const hash = String(nextHash || "#/home");
    if (window.location.hash === hash) {
      render();
      return;
    }
    window.location.hash = hash;
  }

  async function render() {
    const route = parseRouteFromHash(window.location.hash);
    const page = pages[route.name] || pages.home;

    if (typeof activeCleanup === "function") {
      activeCleanup();
      activeCleanup = null;
    }

    window.scrollTo(0, 0);

    const maybeCleanup = page.mount({
      mountNode,
      route,
      navigate,
    });

    if (typeof maybeCleanup === "function") {
      activeCleanup = maybeCleanup;
    } else if (maybeCleanup && typeof maybeCleanup.then === "function") {
      const cleanup = await maybeCleanup;
      if (typeof cleanup === "function") {
        activeCleanup = cleanup;
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    if (!window.location.hash) {
      window.location.hash = "#/";
    }
    window.addEventListener("hashchange", render);
    render();
  }

  function stop() {
    if (!started) return;
    started = false;
    window.removeEventListener("hashchange", render);
    if (typeof activeCleanup === "function") {
      activeCleanup();
      activeCleanup = null;
    }
  }

  return {
    start,
    stop,
    navigate,
  };
}
