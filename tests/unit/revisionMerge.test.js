import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeTextWithBase } from "../../public/app/services/revision-merge.js";

describe("revision merge", () => {
  it("returns local when only local changed", () => {
    const result = mergeTextWithBase("alpha", "alpha local", "alpha");
    assert.equal(result.status, "local");
    assert.equal(result.text, "alpha local");
  });

  it("returns remote when only remote changed", () => {
    const result = mergeTextWithBase("alpha", "alpha", "alpha remote");
    assert.equal(result.status, "remote");
    assert.equal(result.text, "alpha remote");
  });

  it("auto-merges disjoint edits", () => {
    const base = "Line 1\nLine 2\nLine 3\n";
    const local = "Line 1\nLine two\nLine 3\n";
    const remote = "Line 1\nLine 2\nLine three\n";
    const result = mergeTextWithBase(base, local, remote);
    assert.equal(result.status, "merged");
    assert.equal(result.text, "Line 1\nLine two\nLine three\n");
  });

  it("marks overlapping edits as conflict", () => {
    const base = "Hello world";
    const local = "Hello local";
    const remote = "Hello remote";
    const result = mergeTextWithBase(base, local, remote);
    assert.equal(result.status, "conflict");
    assert.equal(result.text, local);
  });

  it("marks same-position insertions as conflict", () => {
    const base = "abc";
    const local = "aXbc";
    const remote = "aYbc";
    const result = mergeTextWithBase(base, local, remote);
    assert.equal(result.status, "conflict");
    assert.equal(result.text, local);
  });
});
