import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

let tokenize;
let buildBm25Index;
let lexicalScore;
let resolveEnrichmentProject;
let createMemoryQueryOps;

before(async () => {
  process.env.DB_PROVIDER = process.env.DB_PROVIDER || "postgres";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://example:example@localhost:5432/stash_test";
  const memoryService = await import("../../src/memoryService.js");
  const queryMemoryOps = await import("../../src/memory/queryMemoryOps.js");
  tokenize = memoryService.tokenize;
  buildBm25Index = memoryService.buildBm25Index;
  lexicalScore = memoryService.lexicalScore;
  resolveEnrichmentProject = memoryService.resolveEnrichmentProject;
  createMemoryQueryOps = queryMemoryOps.createMemoryQueryOps;
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

describe("resolveEnrichmentProject", () => {
  it("prefers the note's current project when present", () => {
    const result = resolveEnrichmentProject({
      requestedProject: "Requested Folder",
      currentProject: "Current Folder",
      normalizedSourceType: "text",
      enrichmentProject: "AI Folder",
    });
    assert.equal(result, "Current Folder");
  });

  it("falls back to requested project when current project is missing", () => {
    const result = resolveEnrichmentProject({
      requestedProject: "Requested Folder",
      currentProject: "",
      normalizedSourceType: "text",
      enrichmentProject: "AI Folder",
    });
    assert.equal(result, "Requested Folder");
  });

  it("defaults file uploads to General when no explicit project is set", () => {
    const result = resolveEnrichmentProject({
      requestedProject: "",
      currentProject: "",
      normalizedSourceType: "file",
      enrichmentProject: "AI Folder",
    });
    assert.equal(result, "General");
  });

  it("uses enrichment project only when no explicit project exists", () => {
    const result = resolveEnrichmentProject({
      requestedProject: "",
      currentProject: "",
      normalizedSourceType: "text",
      enrichmentProject: "AI Folder",
    });
    assert.equal(result, "AI Folder");
  });
});

describe("getMemoryRawContent", () => {
  function makeQueryOpsForNote(note) {
    return createMemoryQueryOps({
      resolveActor(actor) {
        return actor || { workspaceId: "w1", userId: "u1", role: "owner" };
      },
      listVisibleNotesForActor: async () => [],
      clampInt(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(parsed)));
      },
      noteRepo: {
        async getNoteById() {
          return note;
        },
      },
      assertCanReadNote: async () => {},
      listSearchCandidatesForActor: async () => [],
      tokenize: () => [],
      buildBm25Index: () => ({ N: 0, termFreqs: [], avgDocLength: 0, docFreq: new Map() }),
      bm25ScoreFromIndex: () => 0,
      lexicalScore: () => 0,
      normalizeScores: () => new Map(),
      makeExcerpt: () => "",
      getConsolidatedMemoryFilePath: () => "",
      makeConsolidatedTemplate: () => "",
      fs: {
        readFile: async () => "",
        writeFile: async () => {},
      },
      isWorkspaceManager: () => true,
      collaborationRepo: {
        listFolderMembershipsForUser: async () => [],
      },
      folderRepo: {
        listAllFolders: async () => [],
      },
      normalizeFolderMemberRole: (role) => role,
      roleAtLeast: () => false,
      materializeCitation: () => ({}),
      normalizeMemoryScope: (scope) => scope,
      normalizeWorkingSetIds: (ids) => (Array.isArray(ids) ? ids : []),
      createEmbedding: async () => [],
      embeddingCache: new Map(),
      pseudoEmbedding: () => [],
      cosineSimilarity: () => 0,
    });
  }

  it("falls back to top-level content when extracted fields are empty for text notes", async () => {
    const note = {
      id: "n1",
      sourceType: "text",
      content: "# Brainstorm template\n\n- item",
      rawContent: "",
      markdownContent: "",
      summary: "template",
      project: "text files",
      fileName: "",
      fileMime: "",
      createdAt: "2026-02-23T00:00:00.000Z",
      metadata: { title: "Brainstorm Template" },
    };
    const ops = makeQueryOpsForNote(note);
    const result = await ops.getMemoryRawContent({
      id: "n1",
      includeMarkdown: true,
      actor: { workspaceId: "w1", userId: "u1", role: "owner" },
    });

    assert.equal(result.rawContent, note.content);
    assert.equal(result.markdownContent, note.content);
    assert.equal(result.content, note.content);
  });

  it("does not backfill extracted fields from top-level content for file notes", async () => {
    const note = {
      id: "n2",
      sourceType: "file",
      content: "User caption",
      rawContent: "",
      markdownContent: "",
      summary: "file summary",
      project: "uploads",
      fileName: "spec.pdf",
      fileMime: "application/pdf",
      createdAt: "2026-02-23T00:00:00.000Z",
      metadata: { title: "Spec PDF" },
    };
    const ops = makeQueryOpsForNote(note);
    const result = await ops.getMemoryRawContent({
      id: "n2",
      includeMarkdown: true,
      actor: { workspaceId: "w1", userId: "u1", role: "owner" },
    });

    assert.equal(result.content, note.content);
    assert.equal(result.rawContent, "");
    assert.equal(result.markdownContent, "");
  });
});
