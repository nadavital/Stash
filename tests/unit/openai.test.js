import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWebSearchTool,
  heuristicSummary,
  heuristicTags,
  pseudoEmbedding,
  cosineSimilarity,
  normalizeVector,
  extractDomainFromUrl,
  extractDomainsFromText,
  extractOutputText,
  extractOutputUrlCitations,
} from "../../src/openai.js";

describe("heuristicSummary", () => {
  it("returns text unchanged when under maxLen", () => {
    assert.equal(heuristicSummary("hello world"), "hello world");
  });

  it("truncates long text", () => {
    const long = "a".repeat(300);
    const result = heuristicSummary(long, 50);
    assert.ok(result.length <= 50);
    assert.ok(result.endsWith("..."));
  });

  it("returns 'No content' for empty input", () => {
    assert.equal(heuristicSummary(""), "No content");
    assert.equal(heuristicSummary(null), "No content");
  });

  it("collapses whitespace", () => {
    assert.equal(heuristicSummary("  hello   world  "), "hello world");
  });
});

describe("heuristicTags", () => {
  it("extracts top frequent words", () => {
    const tags = heuristicTags("react react react node node vue", 3);
    assert.ok(tags.includes("react"));
    assert.ok(tags.includes("node"));
    assert.equal(tags.length, 3);
  });

  it("filters stop words", () => {
    const tags = heuristicTags("the and for with this code");
    assert.ok(!tags.includes("the"));
    assert.ok(!tags.includes("and"));
    assert.ok(tags.includes("code"));
  });

  it("filters short words", () => {
    const tags = heuristicTags("to be or not");
    assert.equal(tags.length, 0);
  });

  it("handles empty input", () => {
    assert.deepEqual(heuristicTags(""), []);
    assert.deepEqual(heuristicTags(null), []);
  });
});

describe("pseudoEmbedding", () => {
  it("returns array of specified dimensions", () => {
    const emb = pseudoEmbedding("hello world", 128);
    assert.equal(emb.length, 128);
  });

  it("returns default 256 dimensions", () => {
    const emb = pseudoEmbedding("test");
    assert.equal(emb.length, 256);
  });

  it("produces normalized vector", () => {
    const emb = pseudoEmbedding("some text for embedding");
    const norm = Math.sqrt(emb.reduce((acc, n) => acc + n * n, 0));
    assert.ok(Math.abs(norm - 1) < 0.001, `Norm should be ~1, got ${norm}`);
  });

  it("produces same result for same input", () => {
    const a = pseudoEmbedding("test input");
    const b = pseudoEmbedding("test input");
    assert.deepEqual(a, b);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0, 1];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 0.001);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    assert.equal(cosineSimilarity(a, b), 0);
  });

  it("returns 0 for mismatched lengths", () => {
    assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  });

  it("returns 0 for empty arrays", () => {
    assert.equal(cosineSimilarity([], []), 0);
  });

  it("handles non-array input", () => {
    assert.equal(cosineSimilarity(null, [1]), 0);
  });
});

describe("normalizeVector", () => {
  it("normalizes to unit length", () => {
    const v = normalizeVector([3, 4]);
    const norm = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    assert.ok(Math.abs(norm - 1) < 0.001);
  });

  it("handles zero vector", () => {
    const v = normalizeVector([0, 0, 0]);
    assert.deepEqual(v, [0, 0, 0]);
  });
});

describe("extractOutputText", () => {
  it("extracts output_text string", () => {
    assert.equal(extractOutputText({ output_text: "hello" }), "hello");
  });

  it("extracts from output array", () => {
    const payload = {
      output: [
        {
          content: [
            { type: "output_text", text: "first" },
            { type: "output_text", text: "second" },
          ],
        },
      ],
    };
    assert.equal(extractOutputText(payload), "first\nsecond");
  });

  it("returns empty for null", () => {
    assert.equal(extractOutputText(null), "");
    assert.equal(extractOutputText(undefined), "");
  });

  it("prefers output_text over output array", () => {
    const payload = {
      output_text: "preferred",
      output: [{ content: [{ text: "fallback" }] }],
    };
    assert.equal(extractOutputText(payload), "preferred");
  });
});

describe("web search helpers", () => {
  it("extracts hostnames from URLs and text", () => {
    assert.equal(extractDomainFromUrl("https://www.openai.com/docs"), "www.openai.com");
    const domains = extractDomainsFromText("Compare https://openai.com and https://example.org/path", 5);
    assert.deepEqual(domains, ["openai.com", "example.org"]);
  });

  it("builds web_search tool with domain filters and location", () => {
    const tool = buildWebSearchTool({
      allowedDomains: ["openai.com", "https://example.org/path"],
      userLocation: { country: "US", city: "San Francisco" },
      externalWebAccess: false,
      type: "web_search",
    });
    assert.equal(tool.type, "web_search");
    assert.deepEqual(tool.filters.allowed_domains, ["openai.com", "example.org"]);
    assert.equal(tool.user_location.country, "US");
    assert.equal(tool.user_location.city, "San Francisco");
    assert.equal(tool.external_web_access, false);
  });

  it("extracts URL citations from response output annotations", () => {
    const citations = extractOutputUrlCitations({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Example",
              annotations: [
                { type: "url_citation", url: "https://example.com", title: "Example" },
                { type: "url_citation", url: "https://openai.com", title: "OpenAI" },
              ],
            },
          ],
        },
      ],
    }, 10);
    assert.deepEqual(citations, [
      { url: "https://example.com", title: "Example" },
      { url: "https://openai.com", title: "OpenAI" },
    ]);
  });
});
