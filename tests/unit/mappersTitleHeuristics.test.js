import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNoteTitle } from "../../public/app/services/mappers.js";

describe("buildNoteTitle heuristics", () => {
  it("extracts the primary heading from dense markdown lines", () => {
    const title = buildNoteTitle({
      sourceType: "file",
      content: "# Test Context Note ## Items currently in **Github Repos** 1. - not idea",
    });
    assert.equal(title, "Test Context Note");
  });

  it("falls back to the first line instead of the full multiline body", () => {
    const title = buildNoteTitle({
      sourceType: "text",
      content: "Project checkpoint status update for sprint alpha\n- pending task one\n- pending task two",
    });
    assert.equal(title, "Project checkpoint status update for sprint alpha");
  });

  it("applies heading extraction on fallback extracted content", () => {
    const title = buildNoteTitle({
      sourceType: "file",
      content: "File: notes.md",
      markdownContent: "# Working Plan ## Tasks 1. - one",
    });
    assert.equal(title, "Working Plan");
  });
});
