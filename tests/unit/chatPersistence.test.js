import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildChatStorageKey,
  clearPersistedChatState,
  loadPersistedChatState,
  sanitizeChatState,
  savePersistedChatState,
} from "../../public/app/services/chat-persistence.js";

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

describe("chat persistence", () => {
  it("builds a workspace/user-scoped storage key", () => {
    const key = buildChatStorageKey({ workspaceId: "ws-1", userId: "user-9" });
    assert.equal(key, "stash:chat:v1:ws-1:user-9");
  });

  it("sanitizes chat messages and citations", () => {
    const state = sanitizeChatState({
      chatMessages: [
        { role: "assistant", text: "hello", id: "a-1" },
        { role: "bad-role", text: "drop me" },
        { role: "user", text: "" },
      ],
      chatCitations: [
        {
          rank: 1,
          note: {
            id: "note-1",
            title: "Title",
            project: "Project",
            sourceType: "link",
            sourceUrl: "https://example.com",
            summary: "summary",
          },
        },
        { note: {} },
      ],
    });

    assert.equal(state.chatMessages.length, 1);
    assert.equal(state.chatMessages[0].role, "assistant");
    assert.equal(state.chatCitations.length, 1);
    assert.equal(state.chatCitations[0].note.id, "note-1");
  });

  it("saves and loads persisted chat state", () => {
    const storage = createMemoryStorage();
    const session = { workspaceId: "ws-2", userId: "user-2" };
    const inputState = {
      chatMessages: [
        { role: "user", text: "question", id: "u-1" },
        { role: "assistant", text: "answer", id: "a-1" },
      ],
      chatCitations: [{ note: { id: "n-1", title: "Note 1" } }],
    };

    savePersistedChatState(storage, session, inputState);
    const loaded = loadPersistedChatState(storage, session);

    assert.ok(loaded);
    assert.equal(loaded.chatMessages.length, 2);
    assert.equal(loaded.chatMessages[0].text, "question");
    assert.equal(loaded.chatCitations.length, 1);
    assert.equal(loaded.chatCitations[0].note.id, "n-1");
  });

  it("handles corrupted persisted payloads gracefully", () => {
    const session = { workspaceId: "ws-3", userId: "user-3" };
    const key = buildChatStorageKey(session);
    const storage = createMemoryStorage({ [key]: "{not-json" });

    const loaded = loadPersistedChatState(storage, session);
    assert.equal(loaded, null);
  });

  it("removes persisted entry when chat is empty", () => {
    const storage = createMemoryStorage();
    const session = { workspaceId: "ws-4", userId: "user-4" };
    const key = buildChatStorageKey(session);

    savePersistedChatState(storage, session, {
      chatMessages: [{ role: "user", text: "hello" }],
      chatCitations: [],
    });
    assert.ok(storage.getItem(key));

    savePersistedChatState(storage, session, { chatMessages: [], chatCitations: [] });
    assert.equal(storage.getItem(key), null);
  });

  it("clears persisted state explicitly", () => {
    const session = { workspaceId: "ws-5", userId: "user-5" };
    const key = buildChatStorageKey(session);
    const storage = createMemoryStorage({
      [key]: JSON.stringify({ chatMessages: [{ role: "user", text: "x" }], chatCitations: [] }),
    });

    clearPersistedChatState(storage, session);
    assert.equal(storage.getItem(key), null);
  });
});
