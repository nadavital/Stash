import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildItemActivityEntries } from "../../public/app/services/render-item-detail.js";

describe("buildItemActivityEntries", () => {
  it("merges comments and versions sorted by newest timestamp", () => {
    const note = {
      metadata: {
        comments: [
          { text: "First", actor: "Alice", createdAt: "2026-02-18T10:00:00.000Z" },
          { text: "Second", actor: "Bob", createdAt: "2026-02-19T08:00:00.000Z" },
        ],
      },
    };
    const versions = [
      { versionNumber: 3, changeSummary: "Updated title", actorUserId: "user_abc", createdAt: "2026-02-19T09:00:00.000Z" },
    ];

    const entries = buildItemActivityEntries(note, versions);

    assert.equal(entries.length, 3);
    assert.equal(entries[0].type, "edit");
    assert.equal(entries[1].text, "Second");
    assert.equal(entries[2].text, "First");
  });

  it("replaces id-like actor labels with friendly fallbacks", () => {
    const note = {
      metadata: {
        comments: [
          { text: "Comment", actor: "user_12345", createdAt: "2026-02-19T10:00:00.000Z" },
        ],
      },
    };
    const versions = [
      { versionNumber: 1, actorUserId: "550e8400-e29b-41d4-a716-446655440000", createdAt: "2026-02-19T11:00:00.000Z" },
    ];

    const entries = buildItemActivityEntries(note, versions);

    assert.equal(entries[0].actor, "Workspace member");
    assert.equal(entries[1].actor, "You");
  });
});
