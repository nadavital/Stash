import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

let tokenize;
let buildBm25Index;
let lexicalScore;

before(async () => {
  process.env.DB_PROVIDER = process.env.DB_PROVIDER || "postgres";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://example:example@localhost:5432/stash_test";
  const memoryService = await import("../../src/memoryService.js");
  tokenize = memoryService.tokenize;
  buildBm25Index = memoryService.buildBm25Index;
  lexicalScore = memoryService.lexicalScore;
});

describe("tokenize", () => {
  it("lowercases and splits text", () => {
    assert.deepEqual(tokenize("Hello World"), ["hello", "world"]);
  });

  it("removes non-alphanumeric characters", () => {
    assert.deepEqual(tokenize("hello, world! 123"), ["hello", "world", "123"]);
  });

  it("handles empty input", () => {
    assert.deepEqual(tokenize(""), []);
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(undefined), []);
  });

  it("collapses whitespace", () => {
    assert.deepEqual(tokenize("  hello   world  "), ["hello", "world"]);
  });
});

describe("buildBm25Index", () => {
  it("builds index from documents", () => {
    const docs = [
      { text: "hello world" },
      { text: "hello foo bar" },
      { text: "baz qux" },
    ];
    const index = buildBm25Index(docs, (d) => d.text);
    assert.ok(index);
    assert.equal(index.N, 3);
    assert.equal(index.termFreqs.length, 3);
    assert.ok(index.avgDocLength > 0);
  });

  it("handles empty docs", () => {
    const index = buildBm25Index([], (d) => d.text);
    assert.equal(index.N, 0);
    assert.equal(index.termFreqs.length, 0);
  });

  it("computes document frequencies", () => {
    const docs = [
      { text: "hello world" },
      { text: "hello bar" },
    ];
    const index = buildBm25Index(docs, (d) => d.text);
    // 'hello' appears in both docs
    assert.equal(index.docFreq.get("hello"), 2);
    // 'world' appears in 1 doc
    assert.equal(index.docFreq.get("world"), 1);
  });
});

describe("lexicalScore", () => {
  function makeNote(overrides = {}) {
    return {
      content: "",
      rawContent: "",
      markdownContent: "",
      summary: "",
      tags: [],
      project: "",
      fileName: "",
      ...overrides,
    };
  }

  it("returns 1.0 for perfect token overlap", () => {
    const note = makeNote({ content: "hello world" });
    const score = lexicalScore(note, ["hello", "world"]);
    assert.equal(score, 1);
  });

  it("returns 0 for no overlap", () => {
    const note = makeNote({ content: "hello world" });
    const score = lexicalScore(note, ["foo", "bar"]);
    assert.equal(score, 0);
  });

  it("returns partial overlap score", () => {
    const note = makeNote({ content: "hello world" });
    const score = lexicalScore(note, ["hello", "missing"]);
    assert.equal(score, 0.5);
  });

  it("returns 0 for empty query tokens", () => {
    const note = makeNote({ content: "hello world" });
    const score = lexicalScore(note, []);
    assert.equal(score, 0);
  });

  it("includes tags in matching", () => {
    const note = makeNote({ tags: ["javascript", "react"] });
    const score = lexicalScore(note, ["react"]);
    assert.equal(score, 1);
  });

  it("includes summary in matching", () => {
    const note = makeNote({ summary: "quick brown fox" });
    const score = lexicalScore(note, ["fox"]);
    assert.equal(score, 1);
  });

  it("includes project in matching", () => {
    const note = makeNote({ project: "myproject" });
    const score = lexicalScore(note, ["myproject"]);
    assert.equal(score, 1);
  });
});
