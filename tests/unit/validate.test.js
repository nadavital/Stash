import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateNotePayload, validateBatchPayload } from "../../src/validate.js";

describe("validateNotePayload", () => {
  it("accepts valid payload with content", () => {
    const result = validateNotePayload({ content: "hello", sourceType: "text" });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejects empty payload when content is required", () => {
    const result = validateNotePayload({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("required")));
  });

  it("allows empty content when requireContent is false", () => {
    const result = validateNotePayload({}, { requireContent: false });
    assert.equal(result.valid, true);
  });

  it("rejects invalid sourceType", () => {
    const result = validateNotePayload({ content: "x", sourceType: "video" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("sourceType")));
  });

  it("accepts valid sourceTypes", () => {
    for (const st of ["text", "link", "image", "file"]) {
      const result = validateNotePayload({ content: "x", sourceType: st });
      assert.equal(result.valid, true, `sourceType ${st} should be valid`);
    }
  });

  it("rejects content exceeding max length", () => {
    const result = validateNotePayload({ content: "x".repeat(100001) });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("maximum length")));
  });

  it("rejects non-string content", () => {
    const result = validateNotePayload({ content: 123 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("content must be a string")));
  });

  it("rejects tags that are not an array", () => {
    const result = validateNotePayload({ content: "x", tags: "not-array" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("tags must be an array")));
  });

  it("rejects too many tags", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    const result = validateNotePayload({ content: "x", tags });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("maximum of 20")));
  });

  it("rejects project exceeding max length", () => {
    const result = validateNotePayload({ content: "x", project: "a".repeat(121) });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("project")));
  });

  it("accepts sourceUrl as content alternative", () => {
    const result = validateNotePayload({ sourceUrl: "https://example.com" });
    assert.equal(result.valid, true);
  });
});

describe("validateBatchPayload", () => {
  it("accepts valid ids array", () => {
    const result = validateBatchPayload({ ids: ["id1", "id2"] });
    assert.equal(result.valid, true);
  });

  it("rejects missing ids", () => {
    const result = validateBatchPayload({});
    assert.equal(result.valid, false);
  });

  it("rejects empty ids array", () => {
    const result = validateBatchPayload({ ids: [] });
    assert.equal(result.valid, false);
  });

  it("rejects ids array exceeding 200", () => {
    const ids = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    const result = validateBatchPayload({ ids });
    assert.equal(result.valid, false);
  });
});
