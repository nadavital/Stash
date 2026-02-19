import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCitationNoteAliasMap,
  createCitationNoteNameAliasMap,
  resolveAgentNoteId,
  resolveAgentFolderId,
  resolveAgentToolArgs,
} from "../../src/chatToolArgs.js";

describe("chat tool note-id resolution", () => {
  it("maps citation labels like N1/[N2] to actual note ids", () => {
    const citationAliasMap = createCitationNoteAliasMap([
      { note: { id: "note-abc" } },
      { note: { id: "note-def" } },
    ]);

    assert.equal(resolveAgentNoteId("N1", { citationAliasMap }), "note-abc");
    assert.equal(resolveAgentNoteId("[N2]", { citationAliasMap }), "note-def");
  });

  it("maps context aliases like 'this note' to contextNoteId", () => {
    assert.equal(
      resolveAgentNoteId("this note", { contextNoteId: "note-current" }),
      "note-current"
    );
  });

  it("rewrites note id args for update tools and activity filters", () => {
    const citationAliasMap = createCitationNoteAliasMap([{ note: { id: "note-xyz" } }]);
    const updateArgs = resolveAgentToolArgs(
      "update_note",
      { id: "N1", title: "Retitled" },
      { citationAliasMap, contextNoteId: "note-current" }
    );
    const activityArgs = resolveAgentToolArgs(
      "list_activity",
      { noteId: "this note", limit: 20 },
      { citationAliasMap, contextNoteId: "note-current" }
    );

    assert.equal(updateArgs.id, "note-xyz");
    assert.equal(activityArgs.noteId, "note-current");
  });

  it("falls back to context note id when update tool omits id", () => {
    const args = resolveAgentToolArgs(
      "update_note",
      { title: "Retitled from context" },
      { contextNoteId: "note-current" }
    );
    assert.equal(args.id, "note-current");
  });

  it("maps note title references from citations to real note ids", () => {
    const noteNameAliasMap = createCitationNoteNameAliasMap([
      { note: { id: "note-1", title: "Brainstorm Template" } },
      { note: { id: "note-2", fileName: "roadmap.md" } },
    ]);
    assert.equal(
      resolveAgentNoteId("note named Brainstorm Template", { noteNameAliasMap }),
      "note-1"
    );
    assert.equal(
      resolveAgentNoteId("\"roadmap.md\"", { noteNameAliasMap }),
      "note-2"
    );
  });

  it("maps folder aliases to current folder context", () => {
    assert.equal(
      resolveAgentFolderId("this folder", { contextProject: "Product" }),
      "Product"
    );
  });

  it("defaults create/search project to current folder context", () => {
    const createArgs = resolveAgentToolArgs(
      "create_note",
      { content: "hello" },
      { contextProject: "Product" }
    );
    const searchArgs = resolveAgentToolArgs(
      "search_notes",
      { query: "roadmap", project: "this project" },
      { contextProject: "Product" }
    );
    assert.equal(createArgs.project, "Product");
    assert.equal(searchArgs.project, "Product");
  });
});
