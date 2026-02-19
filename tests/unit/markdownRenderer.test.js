import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DOMParser, parseHTML } from "linkedom";
import { renderMarkdown, renderMarkdownInto } from "../../public/app/services/markdown.js";

if (!globalThis.DOMParser) {
  globalThis.DOMParser = DOMParser;
}

function parseRendered(html) {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${String(html || "")}</body></html>`,
    "text/html"
  );
}

describe("markdown renderer", () => {
  it("renders complex GitHub-flavored markdown structures", () => {
    const input = [
      "# Heading",
      "",
      "Paragraph with **bold**, _emphasis_, ~~strike~~ and [safe link](https://example.com).",
      "",
      "> Blockquote line",
      "",
      "- Item 1",
      "  - Nested item",
      "",
      "- [x] done",
      "- [ ] todo",
      "",
      "| Col A | Col B |",
      "| --- | ---: |",
      "| 1 | 2 |",
      "",
      "```js",
      "console.log('stash');",
      "```",
    ].join("\n");

    const html = renderMarkdown(input);
    const doc = parseRendered(html);

    assert.ok(doc.querySelector("h1"), "heading should render");
    assert.ok(doc.querySelector("blockquote"), "blockquote should render");
    assert.ok(doc.querySelector("ul"), "list should render");
    assert.ok(doc.querySelector("table"), "table should render");
    assert.ok(doc.querySelector("pre code"), "code block should render");
    assert.ok(doc.querySelector("input[type=\"checkbox\"]"), "task list checkbox should render");

    const safeLink = doc.querySelector("a[href=\"https://example.com\"]");
    assert.ok(safeLink, "safe link should be preserved");
    assert.equal(safeLink.getAttribute("target"), "_blank");
    assert.equal(safeLink.getAttribute("rel"), "noopener noreferrer nofollow ugc");
  });

  it("strips dangerous tags and attributes", () => {
    const html = renderMarkdown([
      "<script>alert(1)</script>",
      "<iframe src=\"https://evil.example\"></iframe>",
      "<a href=\"javascript:alert(1)\" onclick=\"alert(2)\">bad link</a>",
      "<img src=\"javascript:alert(3)\" onerror=\"alert(4)\" />",
      "<p onclick=\"alert(5)\">safe text</p>",
    ].join("\n"));

    const doc = parseRendered(html);

    assert.equal(doc.querySelector("script"), null);
    assert.equal(doc.querySelector("iframe"), null);
    assert.equal(doc.querySelector("img"), null);

    const badLink = doc.querySelector("a");
    assert.ok(badLink, "anchor text should remain");
    assert.equal(badLink.getAttribute("href"), null, "javascript: link should be removed");
    assert.equal(badLink.getAttribute("onclick"), null, "event handler should be removed");
    assert.equal(badLink.getAttribute("target"), null, "unsafe link should not open in new tab");

    const p = doc.querySelector("p");
    assert.ok(p, "paragraph should remain");
    assert.equal(p.getAttribute("onclick"), null);
  });

  it("allows safe relative and explicit protocols while blocking unsafe protocols", () => {
    const html = renderMarkdown([
      "[root](/path/to/item)",
      "[dot](./relative/item)",
      "[mail](mailto:test@example.com)",
      "[tel](tel:+1234567)",
      "[ftp](ftp://example.com/file.txt)",
      "[js](javascript:alert(1))",
    ].join(" "));

    const doc = parseRendered(html);
    const links = [...doc.querySelectorAll("a")];
    assert.equal(links.length, 6);

    const hrefs = links.map((link) => link.getAttribute("href"));
    assert.equal(hrefs[0], "/path/to/item");
    assert.equal(hrefs[1], "./relative/item");
    assert.equal(hrefs[2], "mailto:test@example.com");
    assert.equal(hrefs[3], "tel:+1234567");
    assert.equal(hrefs[4], null, "ftp links should be stripped");
    assert.equal(hrefs[5], null, "javascript links should be stripped");
  });

  it("sanitizes code language class names", () => {
    const html = renderMarkdown([
      "```js\" onclick=\"alert(1)",
      "const value = 1;",
      "```",
    ].join("\n"));

    const doc = parseRendered(html);
    const code = doc.querySelector("pre code");
    assert.ok(code, "code block should render");
    const className = code.getAttribute("class") || "";
    assert.ok(!className.includes("onclick"), "unsafe class fragments should be removed");
  });

  it("renders into an element and applies markdown-body class", () => {
    const { document } = parseHTML("<html><body><div id=\"root\"></div></body></html>");
    const root = document.getElementById("root");
    renderMarkdownInto(root, "## Title\n\n`inline` and **bold**");

    assert.ok(root.classList.contains("markdown-body"));
    assert.ok(root.querySelector("h2"));
    assert.ok(root.querySelector("code"));
    assert.ok(root.querySelector("strong"));
  });
});
