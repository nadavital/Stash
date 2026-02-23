import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../public/app/state/store.js";
import { createWorkspaceSync } from "../../public/app/services/workspace-sync.js";

describe("workspace sync", () => {
  it("applies note patch commits into canonical maps and hydrated lists", () => {
    const store = createStore();
    const sync = createWorkspaceSync({ store });
    const seed = {
      id: "n1",
      content: "Old",
      summary: "",
      tags: [],
      project: "Focus",
      metadata: { title: "Old title" },
      revision: 1,
    };
    store.setState({ notes: [seed] });
    sync.ingestNotes([seed]);

    const changed = sync.applyAction({
      phase: "commit",
      entityType: "note",
      entityId: "n1",
      mutationType: "note.update",
      patch: { title: "New title", content: "New body", project: "Text Files", revision: 2 },
      name: "update_note",
    });

    assert.equal(changed, true);
    const state = store.getState();
    assert.equal(state.notesById.n1.project, "Text Files");
    assert.equal(state.notesById.n1.content, "New body");
    assert.equal(state.notesById.n1.metadata.title, "New title");
    assert.equal(Number(state.notesById.n1.revision), 2);
    assert.equal(state.notes[0].project, "Text Files");
    sync.dispose();
  });

  it("applies workspace_action_* events from global SSE subscription", () => {
    const store = createStore();
    let onEvent = null;
    const apiClient = {
      subscribeToEvents(listener) {
        onEvent = listener;
        return () => {};
      },
    };
    const sync = createWorkspaceSync({ store, apiClient });
    assert.equal(typeof onEvent, "function");

    onEvent({
      type: "workspace_action_commit",
      phase: "commit",
      entityType: "folder",
      entityId: "folder-1",
      mutationType: "folder.create",
      patch: { name: "Research" },
      name: "create_folder",
    });

    assert.equal(store.getState().foldersById["folder-1"].name, "Research");
    sync.dispose();
  });

  it("removes notes on note.deleted activity events", () => {
    const store = createStore();
    const sync = createWorkspaceSync({ store });
    const seed = {
      id: "n1",
      content: "Hello",
      summary: "",
      tags: [],
      project: "Focus",
      metadata: { title: "Title" },
      revision: 1,
    };
    sync.ingestNotes([seed]);
    store.setState({ notes: [seed] });

    const changed = sync.applyActivityEvent({
      type: "activity",
      eventType: "note.deleted",
      entityType: "note",
      entityId: "n1",
      noteId: "n1",
      details: {},
    });
    assert.equal(changed, true);
    const state = store.getState();
    assert.equal(state.notesById.n1, undefined);
    assert.equal(state.notes.length, 0);
    sync.dispose();
  });

  it("ignores stale note ingest payloads with lower revision", () => {
    const store = createStore();
    const sync = createWorkspaceSync({ store });
    const current = {
      id: "n1",
      content: "Latest content",
      summary: "",
      tags: [],
      project: "Focus",
      metadata: { title: "Latest title" },
      revision: 5,
    };
    sync.ingestNotes([current]);

    const stale = {
      id: "n1",
      content: "Stale content",
      summary: "",
      tags: [],
      project: "Focus",
      metadata: { title: "Stale title" },
      revision: 4,
    };
    const changed = sync.ingestNotes([stale]);
    assert.equal(changed, false);
    const state = store.getState();
    assert.equal(Number(state.notesById.n1.revision), 5);
    assert.equal(state.notesById.n1.content, "Latest content");
    sync.dispose();
  });

  it("ignores stale note commit actions with lower revision", () => {
    const store = createStore();
    const sync = createWorkspaceSync({ store });
    const seed = {
      id: "n1",
      content: "Latest",
      summary: "",
      tags: [],
      project: "Focus",
      metadata: { title: "Title" },
      revision: 8,
    };
    sync.ingestNotes([seed]);

    const changed = sync.applyAction({
      phase: "commit",
      entityType: "note",
      entityId: "n1",
      mutationType: "note.update",
      patch: { content: "Older payload", revision: 7 },
      nextRevision: 7,
      name: "update_note",
    });
    assert.equal(changed, false);
    const state = store.getState();
    assert.equal(Number(state.notesById.n1.revision), 8);
    assert.equal(state.notesById.n1.content, "Latest");
    sync.dispose();
  });
});
