import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNoteTitle } from "../../public/app/services/mappers.js";

describe("buildNoteTitle", () => {
  it("uses markdown heading for readable titles", () => {
    const title = buildNoteTitle({
      sourceType: "text",
      summary: "# Test Context Note\n\n## Items currently in **Github Repos**\n1. Alpha",
      content: "Uploaded file: draft.md",
    });

    assert.equal(title, "Test Context Note");
  });

  it("strips markdown syntax from explicit titles", () => {
    const title = buildNoteTitle({
      sourceType: "text",
      metadata: {
        title: "**Quarterly** _Roadmap_",
      },
      content: "placeholder",
    });

    assert.equal(title, "Quarterly Roadmap");
  });

  it("prefers auto metadata title when explicit title is missing", () => {
    const title = buildNoteTitle({
      sourceType: "text",
      metadata: {
        titleAuto: "Weekly Planning Notes",
      },
      content: "placeholder",
    });

    assert.equal(title, "Weekly Planning Notes");
  });

  it("prefers file name over markdown heading fallback for file notes", () => {
    const title = buildNoteTitle({
      sourceType: "file",
      fileName: "product-spec-v2.md",
      content: "Uploaded file: product-spec-v2.md",
      markdownContent: "# This heading should not become the card title",
    });

    assert.equal(title, "product-spec-v2.md");
  });
});
