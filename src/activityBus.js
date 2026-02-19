const listeners = new Set();

export function subscribeActivity(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishActivity(event) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Listener errors should not break broadcasting.
    }
  }
}
