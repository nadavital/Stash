export function createMemoryEnrichmentOps({
  config,
  publicUploadPath,
  fs,
  path,
  crypto,
  hasOpenAI,
  createResponse,
  convertUploadToMarkdown,
  createEmbedding,
  pseudoEmbedding,
  heuristicSummary,
  heuristicTags,
  noteRepo,
  enrichmentQueue,
  logger,
  nowIso,
  getConsolidatedMemoryFilePath,
  makeConsolidatedTemplate,
  consolidatedSections = [],
}) {
  const ENRICH_NOTE_JOB_TYPE = "enrich_note";
  let enrichmentHandlerRegistered = false;

  function buildProjectFallback(sourceUrl, tags) {
    if (sourceUrl) {
      try {
        const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
        return host.split(".")[0] || "General";
      } catch {
        // no-op
      }
    }
    if (Array.isArray(tags) && tags.length > 0) {
      return tags[0];
    }
    return "General";
  }

  function parseJsonObject(text) {
    if (!text) return null;
    const trimmed = String(text).trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  function textOnlyFromHtml(html) {
    return String(html)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeLinkTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeAutoTitle(value, maxLen = 90) {
    let normalized = String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
      .replace(/[*_~]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return "";
    if (normalized.length > maxLen) {
      normalized = `${normalized.slice(0, maxLen - 1).trim()}...`;
    }
    return normalized;
  }

  function inferTitleFromFileName(fileName = "") {
    const normalized = String(fileName || "").trim();
    if (!normalized) return "";
    const noExt = normalized.replace(/\.[^.]+$/, "");
    const words = noExt
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalizeAutoTitle(titleCaseWords(words), 90);
  }

  function isUserTitleLocked(metadata = null) {
    if (!metadata || typeof metadata !== "object") return false;
    if (metadata.titleEditedByUser === true) return true;
    const source = String(metadata.titleSource || "").trim().toLowerCase();
    return source === "user";
  }

  function toAutoTitleMetadataPatch(title = "", source = "auto") {
    const normalizedTitle = normalizeAutoTitle(title, 180);
    if (!normalizedTitle) return {};
    return {
      title: normalizedTitle,
      titleSource: String(source || "").trim() || "auto",
      titleEditedByUser: false,
      titleAuto: normalizedTitle,
    };
  }

  function buildFallbackAutoTitle(note, linkPreview = null, summary = "", preferredTitle = "") {
    const fromPreferred = normalizeAutoTitle(preferredTitle, 90);
    if (fromPreferred && !/^uploaded file:|^file:/i.test(fromPreferred)) {
      return fromPreferred;
    }

    const existingMetadataTitle = normalizeAutoTitle(note?.metadata?.title || note?.metadata?.titleAuto || "", 90);
    if (existingMetadataTitle) return existingMetadataTitle;

    const fromFileName = inferTitleFromFileName(note?.fileName || "");
    if (fromFileName) return fromFileName;

    const fromSummary = normalizeAutoTitle(summary || note?.summary || linkPreview?.title || "", 90);
    if (fromSummary) return fromSummary;

    const firstLine = String(note?.content || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0] || "";
    const fromContent = normalizeAutoTitle(firstLine, 90);
    if (fromContent && !/^uploaded file:|^file:/i.test(fromContent)) {
      return fromContent;
    }

    const sourceType = String(note?.sourceType || "").trim().toLowerCase();
    if (sourceType === "image") return "Image capture";
    if (sourceType === "file") return "Saved file";
    if (sourceType === "link") {
      const inferred = normalizeAutoTitle(linkPreview?.title || inferEntityTitleFromUrl(note?.sourceUrl || "") || "", 90);
      return inferred || "Saved link";
    }
    return "Saved item";
  }

  function extractHtmlMetaContent(html, key, attribute = "property") {
    if (!html || !key) return "";
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta\\s+[^>]*${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
        "i"
      ),
      new RegExp(
        `<meta\\s+[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*>`,
        "i"
      ),
    ];

    for (const pattern of patterns) {
      const match = String(html).match(pattern);
      if (match?.[1]) {
        return normalizeLinkTitle(match[1]);
      }
    }
    return "";
  }

  function titleCaseWords(input) {
    return String(input || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function inferEntityTitleFromUrl(urlString) {
    try {
      const parsed = new URL(urlString);
      const segments = parsed.pathname
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .map((segment) => normalizeLinkTitle(segment))
        .filter(Boolean);
      const generic = new Set([
        "us",
        "en",
        "restaurant",
        "restaurants",
        "guide",
        "city",
        "hotel",
        "hotels",
        "review",
        "reviews",
      ]);

      const restaurantIdx = segments.findIndex(
        (segment) => segment.toLowerCase() === "restaurant"
      );
      if (restaurantIdx >= 0 && segments[restaurantIdx + 1]) {
        const slug = segments[restaurantIdx + 1].replace(/[-_]+/g, " ");
        const candidate = titleCaseWords(normalizeLinkTitle(slug));
        if (candidate && !generic.has(candidate.toLowerCase())) {
          return candidate;
        }
      }

      for (let i = segments.length - 1; i >= 0; i -= 1) {
        const value = segments[i];
        if (!value) continue;
        const lower = value.toLowerCase();
        if (generic.has(lower)) continue;
        const candidate = titleCaseWords(
          normalizeLinkTitle(value.replace(/[-_]+/g, " "))
        );
        if (candidate) {
          return candidate;
        }
      }

      return normalizeLinkTitle(parsed.hostname.replace(/^www\./, ""));
    } catch {
      return "";
    }
  }

  function isUrlLikeTitle(value) {
    const normalized = normalizeLinkTitle(value);
    if (!normalized) return false;
    if (/^https?:\/\//i.test(normalized)) return true;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(normalized)) return true;
    return false;
  }

  function isMichelinRestaurantUrl(urlString) {
    try {
      const parsed = new URL(urlString);
      return /(^|\.)guide\.michelin\.com$/i.test(parsed.hostname) &&
        /\/restaurant(\/|$)/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isGenericListingTitle(title) {
    const normalized = normalizeLinkTitle(title).toLowerCase();
    if (!normalized) return true;
    return (
      normalized.includes("restaurants in ") ||
      normalized.includes("michelin guide") ||
      normalized.includes("page not found") ||
      normalized.includes("not found") ||
      normalized === "restaurants" ||
      normalized === "restaurant"
    );
  }

  async function inferLinkTitleWithOpenAI({ sourceUrl, linkPreview }) {
    const previewTitle = normalizeLinkTitle(linkPreview?.title || "");
    const fallbackTitle = previewTitle || inferEntityTitleFromUrl(sourceUrl) || "Saved link";
    if (!hasOpenAI()) {
      return fallbackTitle;
    }

    try {
      const inputText = [
        `url: ${sourceUrl || ""}`,
        previewTitle ? `preview_title: ${previewTitle}` : "",
        linkPreview?.excerpt ? `preview_excerpt:\n${String(linkPreview.excerpt).slice(0, 2000)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const { text } = await createResponse({
        instructions:
          "Extract the best concise title for this webpage. Output JSON only: {\"title\":\"...\"}. Prefer the primary entity name for entity pages (for restaurants, return the restaurant name only). Max 90 chars.",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: inputText }],
          },
        ],
        temperature: 0,
      });

      const parsed = parseJsonObject(text);
      let candidate = normalizeLinkTitle(parsed?.title || "");
      const michelinRestaurantUrl = isMichelinRestaurantUrl(sourceUrl);

      if (michelinRestaurantUrl && isGenericListingTitle(candidate) && linkPreview?.excerpt) {
        const targeted = await createResponse({
          instructions:
            "This is a Michelin restaurant page or listing. Extract ONE specific restaurant name from the text. Output JSON only: {\"title\":\"restaurant name\"}. Never return generic titles like 'MICHELIN Guide' or 'Restaurants in ...'.",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `url: ${sourceUrl}\n\npage_text:\n${String(linkPreview.excerpt).slice(0, 4000)}`,
                },
              ],
            },
          ],
          temperature: 0,
        });
        const targetedParsed = parseJsonObject(targeted.text);
        const targetedCandidate = normalizeLinkTitle(targetedParsed?.title || "");
        if (
          targetedCandidate &&
          !isGenericListingTitle(targetedCandidate) &&
          !isUrlLikeTitle(targetedCandidate)
        ) {
          candidate = targetedCandidate;
        }
      }

      if (!candidate || isUrlLikeTitle(candidate)) {
        return fallbackTitle;
      }
      return candidate.slice(0, 90);
    } catch {
      return fallbackTitle;
    }
  }

  async function fetchLinkPreview(urlString) {
    if (!urlString) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(urlString, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "ProjectMemoryBot/0.1",
        },
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("text/html")) {
        return null;
      }

      const html = await response.text();
      const ogTitle =
        extractHtmlMetaContent(html, "og:title", "property") ||
        extractHtmlMetaContent(html, "og:title", "name");
      const twitterTitle =
        extractHtmlMetaContent(html, "twitter:title", "name") ||
        extractHtmlMetaContent(html, "twitter:title", "property");
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const body = textOnlyFromHtml(html);
      const ogImage =
        extractHtmlMetaContent(html, "og:image", "property") ||
        extractHtmlMetaContent(html, "og:image", "name") ||
        extractHtmlMetaContent(html, "twitter:image", "name") ||
        extractHtmlMetaContent(html, "twitter:image", "property") ||
        "";
      return {
        title: normalizeLinkTitle(ogTitle || twitterTitle || (titleMatch ? titleMatch[1] : "")),
        excerpt: body.slice(0, 1600),
        ogImage: ogImage || null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function parseDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid image data URL");
    }
    return {
      mime: match[1],
      base64: match[2],
      bytes: Buffer.from(match[2], "base64"),
    };
  }

  function mimeToExt(mime) {
    switch (mime) {
      case "image/png":
        return "png";
      case "image/jpeg":
        return "jpg";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      default:
        return "png";
    }
  }

  async function saveImageDataUrl(dataUrl) {
    const { mime, bytes } = parseDataUrl(dataUrl);
    const extension = mimeToExt(mime);
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const absolutePath = path.join(config.uploadDir, fileName);

    await fs.writeFile(absolutePath, bytes);

    return {
      imagePath: publicUploadPath(fileName),
      imageAbsolutePath: absolutePath,
      imageMime: mime,
      imageSize: bytes.length,
    };
  }

  function parseGenericDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid file data URL");
    }
    return {
      mime: match[1],
      base64: match[2],
      bytes: Buffer.from(match[2], "base64"),
    };
  }

  function inferMimeFromFileName(fileName = "") {
    const lower = String(fileName || "").toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (lower.endsWith(".doc")) return "application/msword";
    if (lower.endsWith(".txt")) return "text/plain";
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".json")) return "application/json";
    return "";
  }

  function maybeDecodeTextUpload(dataUrl, mime, fileName = "") {
    const normalizedMime = String(mime || "").toLowerCase();
    const isTextLikeMime =
      normalizedMime.startsWith("text/") ||
      [
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-javascript",
        "application/x-yaml",
        "application/yaml",
        "application/csv",
      ].includes(normalizedMime);
    const isTextLikeExt = /\.(txt|md|markdown|json|csv|log|xml|yaml|yml|js|ts)$/i.test(
      String(fileName || "")
    );

    if (!isTextLikeMime && !isTextLikeExt) {
      return "";
    }

    try {
      const parsed = parseGenericDataUrl(dataUrl);
      return String(parsed.bytes.toString("utf8"))
        .replace(/\u0000/g, "")
        .trim();
    } catch {
      return "";
    }
  }

  async function imagePathToDataUrl(imagePath) {
    if (!imagePath) return null;
    const fileName = path.basename(imagePath);
    const absolutePath = path.join(config.uploadDir, fileName);

    try {
      const bytes = await fs.readFile(absolutePath);
      const ext = path.extname(fileName).toLowerCase();
      const mime =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/png";
      return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    }
  }

  function noteTextForEmbedding(note, linkPreview) {
    const compact = (text, max = 2500) => String(text || "").slice(0, max);
    const parts = [
      compact(note.content, 2000),
      compact(note.rawContent, 2500),
      compact(note.markdownContent, 2500),
      compact(note.fileName, 200),
      compact(note.fileMime, 120),
      compact(note.summary, 300),
      Array.isArray(note.tags) ? note.tags.join(" ") : "",
      compact(note.project, 120),
      compact(note.sourceUrl, 300),
      compact(linkPreview?.title, 300),
      compact(linkPreview?.excerpt, 1000),
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  async function buildEnrichment(note, linkPreview = null, precomputed = null) {
    const fallbackSummary = heuristicSummary(note.content);
    const fallbackTags = heuristicTags(`${note.content} ${linkPreview?.title || ""}`);
    const fallbackProject = note.project || buildProjectFallback(note.sourceUrl, fallbackTags);
    const fallbackTitle = buildFallbackAutoTitle(note, linkPreview, fallbackSummary);

    if (
      precomputed &&
      (precomputed.summary ||
        (Array.isArray(precomputed.tags) && precomputed.tags.length) ||
        precomputed.project)
    ) {
      return {
        summary: String(precomputed.summary || fallbackSummary).trim().slice(0, 220) || fallbackSummary,
        tags:
          Array.isArray(precomputed.tags) && precomputed.tags.length
            ? precomputed.tags.slice(0, 8)
            : fallbackTags,
        project: String(precomputed.project || fallbackProject).trim().slice(0, 80) || fallbackProject,
        title: normalizeAutoTitle(precomputed.title || fallbackTitle, 90) || fallbackTitle,
        enrichmentSource: "openai-upload",
      };
    }

    if (!hasOpenAI()) {
      return {
        summary: fallbackSummary,
        tags: fallbackTags,
        project: fallbackProject,
        title: fallbackTitle,
        enrichmentSource: "heuristic",
      };
    }

    try {
      const userText = [
        `source_type: ${note.sourceType}`,
        note.sourceUrl ? `source_url: ${note.sourceUrl}` : "",
        note.fileName ? `file_name: ${note.fileName}` : "",
        note.fileMime ? `file_mime: ${note.fileMime}` : "",
        note.content ? `content:\n${note.content}` : "",
        note.rawContent ? `raw_content:\n${note.rawContent.slice(0, 8000)}` : "",
        note.markdownContent ? `markdown_content:\n${note.markdownContent.slice(0, 8000)}` : "",
        linkPreview?.title ? `link_title: ${linkPreview.title}` : "",
        linkPreview?.excerpt ? `link_excerpt: ${linkPreview.excerpt}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const content = [{ type: "input_text", text: userText }];
      if (note.sourceType === "image" && note.imagePath) {
        const imageDataUrl = await imagePathToDataUrl(note.imagePath);
        if (imageDataUrl) {
          content.push({
            type: "input_image",
            image_url: imageDataUrl,
          });
        }
      }

      const { text } = await createResponse({
        instructions:
          "You are extracting memory metadata for a single-user project notebook. Output JSON only with keys: title (concise, <=90 chars, plain text), summary (<=180 chars), tags (array of 3-8 short lowercase tags), project (2-4 words).",
        input: [
          {
            role: "user",
            content,
          },
        ],
        temperature: 0.1,
      });

      const parsed = parseJsonObject(text);
      const summary =
        typeof parsed?.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 220)
          : fallbackSummary;
      const tags = Array.isArray(parsed?.tags)
        ? parsed.tags
            .map((tag) => String(tag).toLowerCase().trim())
            .filter(Boolean)
            .slice(0, 8)
        : fallbackTags;
      const project =
        typeof parsed?.project === "string" && parsed.project.trim()
          ? parsed.project.trim().slice(0, 80)
          : fallbackProject;
      const title =
        typeof parsed?.title === "string" && parsed.title.trim()
          ? normalizeAutoTitle(parsed.title, 90)
          : fallbackTitle;

      return {
        summary,
        tags,
        project,
        title: title || fallbackTitle,
        enrichmentSource: "openai",
      };
    } catch {
      return {
        summary: fallbackSummary,
        tags: fallbackTags,
        project: fallbackProject,
        title: fallbackTitle,
        enrichmentSource: "heuristic",
      };
    }
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function classifyMemorySection(note) {
    const text = `${note.project || ""} ${(note.tags || []).join(" ")} ${note.fileName || ""} ${note.summary || ""} ${note.content || ""}`.toLowerCase();
    if (/\b(message|call|follow up|landlord|mom|ashna|friend|family|team)\b/.test(text)) {
      return "People & Relationships";
    }
    if (/\b(research|paper|study|analysis|learn|deep research|interview)\b/.test(text)) {
      return "Research & Learning";
    }
    if (/\b(receipt|invoice|tax|w2|1099|payment|credit card|expense|bank)\b/.test(text)) {
      return "Finance & Admin";
    }
    if (/\b(flight|travel|trip|itinerary|hotel|airbnb|uber|lyft)\b/.test(text)) {
      return "Travel & Logistics";
    }
    if (/\b(health|medical|doctor|surgery|gym|fitness|diet)\b/.test(text)) {
      return "Health & Lifestyle";
    }
    if (note.project && note.project.trim()) return "Projects & Work";
    if (/\b(home|personal|grocery|meal|weekend)\b/.test(text)) return "Personal Life";
    return "General";
  }

  function buildConsolidatedEntry(note) {
    const timestamp = note.createdAt || nowIso();
    const title = note.summary || note.fileName || heuristicSummary(note.content, 120);
    const markdownExcerpt = String(note.markdownContent || "").slice(0, 2200).trim();
    const rawExcerpt = String(note.rawContent || "").slice(0, 1200).trim();
    const tags = Array.isArray(note.tags) && note.tags.length ? note.tags.join(", ") : "none";

    const parts = [
      `### ${timestamp} | ${title}`,
      `- note_id: ${note.id}`,
      `- project: ${note.project || "General"}`,
      `- source_type: ${note.sourceType || "text"}`,
      `- tags: ${tags}`,
    ];

    if (markdownExcerpt) {
      parts.push("", "#### Markdown Extract", "```md", markdownExcerpt, "```");
    }
    if (rawExcerpt && rawExcerpt !== markdownExcerpt) {
      parts.push("", "#### Raw Extract", "```text", rawExcerpt, "```");
    }

    return parts.join("\n");
  }

  async function updateConsolidatedMemoryFile(note, workspaceId = config.defaultWorkspaceId) {
    const filePath = getConsolidatedMemoryFilePath(workspaceId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let content;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        content = makeConsolidatedTemplate();
      } else {
        throw error;
      }
    }

    if (content.includes(`note_id: ${note.id}`)) {
      return;
    }

    const section = classifyMemorySection(note);
    if (!content.includes(`## ${section}\n`)) {
      content = `${content.trimEnd()}\n\n## ${section}\n\n_No entries yet._\n`;
    }

    const entry = buildConsolidatedEntry(note);
    const sectionPattern = new RegExp(
      `(^## ${escapeRegExp(section)}\\n)([\\s\\S]*?)(?=\\n## |$)`,
      "m"
    );
    content = content.replace(sectionPattern, (full, header, body) => {
      const trimmed = String(body || "").trim();
      const base = !trimmed || trimmed === "_No entries yet._" ? "" : `${trimmed}\n\n`;
      return `${header}${base}${entry}\n`;
    });

    content = content.replace(/\*\*Last Updated:\*\* .*/, `**Last Updated:** ${nowIso()}`);
    await fs.writeFile(filePath, content, "utf8");

    const fileSize = Buffer.byteLength(content, "utf8");
    if (fileSize > 512 * 1024) {
      const timestamp = nowIso().replace(/[:.]/g, "-");
      const archivePath = path.join(
        path.dirname(filePath),
        `consolidated-memory-archive-${timestamp}.md`
      );
      await fs.copyFile(filePath, archivePath);
      await fs.writeFile(filePath, makeConsolidatedTemplate(), "utf8");
    }
  }

  function extractNoteIdFromConsolidatedBlock(blockLines) {
    for (const line of blockLines) {
      const match = String(line).trim().match(/^- note_id:\s*(.+)$/);
      if (match && match[1]) {
        return String(match[1]).trim();
      }
    }
    return "";
  }

  async function removeConsolidatedMemoryEntries(noteIds = [], workspaceId = config.defaultWorkspaceId) {
    const idSet = new Set(
      (Array.isArray(noteIds) ? noteIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    if (idSet.size === 0) return;

    const filePath = getConsolidatedMemoryFilePath(workspaceId);
    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (error) {
      const isMissing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      if (isMissing) return;
      return;
    }

    const lines = content.split("\n");
    const kept = [];
    let cursor = 0;

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (!line.startsWith("### ")) {
        kept.push(line);
        cursor += 1;
        continue;
      }

      let end = cursor + 1;
      while (end < lines.length && !lines[end].startsWith("### ") && !lines[end].startsWith("## ")) {
        end += 1;
      }

      const block = lines.slice(cursor, end);
      const noteId = extractNoteIdFromConsolidatedBlock(block);
      if (!idSet.has(noteId)) {
        kept.push(...block);
      }
      cursor = end;
    }

    let next = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    if (!next) {
      next = makeConsolidatedTemplate();
    } else if (/\*\*Last Updated:\*\*/.test(next)) {
      next = next.replace(/\*\*Last Updated:\*\* .*/, `**Last Updated:** ${nowIso()}`);
    }
    if (!next.endsWith("\n")) {
      next += "\n";
    }

    try {
      await fs.writeFile(filePath, next, "utf8");
    } catch {
      // no-op: note deletion should not fail because markdown sync failed
    }
  }

  function imagePathToAbsoluteUploadPath(imagePath) {
    const normalized = String(imagePath || "").trim();
    if (!normalized) return "";
    const fileName = path.basename(normalized);
    if (!fileName) return "";
    return path.join(config.uploadDir, fileName);
  }

  async function cleanupDeletedNotesArtifacts(notes = [], workspaceId = config.defaultWorkspaceId) {
    const noteList = Array.isArray(notes) ? notes : [];
    if (!noteList.length) return;

    const noteIds = [];
    const uploadPaths = [];

    for (const note of noteList) {
      const noteId = String(note?.id || "").trim();
      if (noteId) {
        noteIds.push(noteId);
      }

      const uploadPath = imagePathToAbsoluteUploadPath(note?.imagePath);
      if (uploadPath) {
        uploadPaths.push(uploadPath);
      }
    }

    if (uploadPaths.length) {
      await Promise.allSettled(
        uploadPaths.map(async (uploadPath) => {
          try {
            await fs.unlink(uploadPath);
          } catch (error) {
            const isMissing =
              error && typeof error === "object" && "code" in error && error.code === "ENOENT";
            if (!isMissing) {
              // no-op: keep deletion flow resilient
            }
          }
        })
      );
    }

    await removeConsolidatedMemoryEntries(noteIds, workspaceId);
  }

  async function cleanupReplacedImageArtifact(previousImagePath = "", nextImagePath = "") {
    const previousAbsolute = imagePathToAbsoluteUploadPath(previousImagePath);
    const nextAbsolute = imagePathToAbsoluteUploadPath(nextImagePath);
    if (!previousAbsolute || previousAbsolute === nextAbsolute) {
      return;
    }
    try {
      await fs.unlink(previousAbsolute);
    } catch (error) {
      const isMissing =
        error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      if (!isMissing) {
        // no-op: attachment updates should remain resilient
      }
    }
  }

  function resolveEnrichmentProject({
    requestedProject = "",
    currentProject = "",
    normalizedSourceType = "",
    enrichmentProject = "",
  } = {}) {
    const normalizedCurrent = String(currentProject || "").trim();
    if (normalizedCurrent) return normalizedCurrent;

    const normalizedRequested = String(requestedProject || "").trim();
    if (normalizedRequested) return normalizedRequested;

    if (String(normalizedSourceType || "").trim().toLowerCase() === "file") {
      return "General";
    }

    return String(enrichmentProject || "").trim();
  }

  async function processEnrichment({
    noteId,
    workspaceId,
    requestedProject,
    normalizedSourceType,
    normalizedSourceUrl,
    hasFileUpload,
    uploadEnrichment,
    fileDataUrl,
    fileName,
    fileMime,
  }) {
    const tStart = Date.now();
    await noteRepo.updateStatus(noteId, "enriching", workspaceId);

    let note = await noteRepo.getNoteById(noteId, workspaceId);
    if (!note) throw new Error(`Note not found: ${noteId}`);

    if (hasFileUpload && fileDataUrl && hasOpenAI()) {
      try {
        const parsedUpload = await convertUploadToMarkdown({
          fileDataUrl,
          fileName: fileName || `upload.${(fileMime || "").split("/")[1] || "bin"}`,
          fileMimeType: fileMime || "application/octet-stream",
        });
        if (parsedUpload.rawContent || parsedUpload.markdownContent) {
          await noteRepo.updateEnrichment({
            id: noteId,
            summary: note.summary,
            tags: note.tags,
            project: note.project,
            embedding: null,
            metadata: {
              ...(note.metadata || {}),
            },
            rawContent: parsedUpload.rawContent || null,
            markdownContent: parsedUpload.markdownContent || null,
            updatedAt: nowIso(),
            workspaceId,
          });
          note = await noteRepo.getNoteById(noteId, workspaceId);
        }
        uploadEnrichment = {
          title: parsedUpload.title || "",
          summary: parsedUpload.summary || "",
          tags: Array.isArray(parsedUpload.tags) ? parsedUpload.tags : [],
          project: parsedUpload.project || "",
        };
      } catch {
        // file conversion failed — continue with heuristic enrichment
      }
    }

    let linkPreview = null;
    if (normalizedSourceType === "link" && normalizedSourceUrl) {
      linkPreview = await fetchLinkPreview(normalizedSourceUrl);
      const userLockedTitle = isUserTitleLocked(note.metadata);
      const linkTitle = await inferLinkTitleWithOpenAI({
        sourceUrl: normalizedSourceUrl,
        linkPreview,
      });
      if ((!userLockedTitle && linkTitle) || linkPreview?.ogImage) {
        await noteRepo.updateEnrichment({
          id: noteId,
          summary: note.summary,
          tags: note.tags,
          project: note.project,
          embedding: null,
          metadata: {
            ...(note.metadata || {}),
            ...(!userLockedTitle
              ? {
                  ...toAutoTitleMetadataPatch(linkTitle, "ai"),
                  ...(linkTitle ? { linkTitle } : {}),
                }
              : {}),
            ...(linkPreview?.ogImage ? { ogImage: linkPreview.ogImage } : {}),
          },
          updatedAt: nowIso(),
          workspaceId,
        });
        note = await noteRepo.getNoteById(noteId, workspaceId);
      }
    }

    const enrichment = await buildEnrichment(note, linkPreview, uploadEnrichment);
    const latestNote = await noteRepo.getNoteById(noteId, workspaceId);
    const latestMetadata = {
      ...(latestNote?.metadata || note?.metadata || {}),
    };
    const userLockedTitle = isUserTitleLocked(latestMetadata);
    const autoTitleCandidate = userLockedTitle
      ? ""
      : buildFallbackAutoTitle(
          {
            ...note,
            ...(latestNote || {}),
            metadata: latestMetadata,
          },
          linkPreview,
          enrichment.summary || "",
          enrichment.title || ""
        );
    const titlePatch = !userLockedTitle
      ? toAutoTitleMetadataPatch(
          autoTitleCandidate,
          enrichment.enrichmentSource === "openai" || enrichment.enrichmentSource === "openai-upload" ? "ai" : "auto"
        )
      : {};
    const finalProject = resolveEnrichmentProject({
      requestedProject,
      currentProject: latestNote?.project ?? note?.project ?? "",
      normalizedSourceType,
      enrichmentProject: enrichment.project,
    });
    const embeddingText = noteTextForEmbedding(
      {
        ...note,
        summary: enrichment.summary,
        tags: enrichment.tags,
        project: finalProject,
      },
      linkPreview
    );

    let embedding;
    let embeddingSource = "openai";
    try {
      if (normalizedSourceType === "file" && embeddingText.length > 5000) {
        embedding = pseudoEmbedding(embeddingText);
        embeddingSource = "pseudo-large-upload";
      } else {
        embedding = await createEmbedding(embeddingText);
      }
    } catch {
      embedding = pseudoEmbedding(embeddingText);
      embeddingSource = "pseudo-fallback";
    }

    const enrichedNote = await noteRepo.updateEnrichment({
      id: noteId,
      summary: enrichment.summary,
      tags: enrichment.tags,
      project: finalProject,
      embedding,
      metadata: {
        ...latestMetadata,
        ...titlePatch,
        enrichmentSource: enrichment.enrichmentSource,
        embeddingSource,
        processingMs: Date.now() - tStart,
        enrichedAt: nowIso(),
      },
      updatedAt: nowIso(),
      workspaceId,
    });

    await noteRepo.updateStatus(noteId, "ready", workspaceId);

    if (hasFileUpload) {
      await updateConsolidatedMemoryFile(enrichedNote, workspaceId);
    }

    return enrichedNote;
  }

  function registerEnrichmentQueueHandler() {
    if (enrichmentHandlerRegistered) return;
    enrichmentQueue.registerHandler(ENRICH_NOTE_JOB_TYPE, async (payload = {}) => {
      const params = {
        noteId: String(payload.noteId || "").trim(),
        workspaceId: String(payload.workspaceId || "").trim(),
        requestedProject: String(payload.requestedProject || "").trim(),
        normalizedSourceType: String(payload.normalizedSourceType || "").trim(),
        normalizedSourceUrl: String(payload.normalizedSourceUrl || "").trim(),
        hasFileUpload: Boolean(payload.hasFileUpload),
        uploadEnrichment: payload.uploadEnrichment || null,
        fileDataUrl: String(payload.fileDataUrl || "").trim() || null,
        fileName: String(payload.fileName || "").trim(),
        fileMime: String(payload.fileMime || "").trim(),
      };
      if (!params.noteId) {
        throw new Error("Missing note id for enrichment job");
      }
      if (!params.workspaceId) {
        throw new Error("Missing workspace id for enrichment job");
      }
      try {
        return await processEnrichment(params);
      } catch (error) {
        await noteRepo.updateStatus(params.noteId, "failed", params.workspaceId).catch(() => {});
        throw error;
      }
    });
    enrichmentHandlerRegistered = true;
  }

  function buildEnrichmentJobParamsFromNote(
    note = {},
    { workspaceId = "", visibilityUserId = null } = {}
  ) {
    return {
      noteId: String(note.id || "").trim(),
      workspaceId: String(workspaceId || note.workspaceId || "").trim(),
      visibilityUserId: String(visibilityUserId || "").trim() || null,
      requestedProject: String(note.project || "").trim(),
      normalizedSourceType: String(note.sourceType || "text").trim() || "text",
      normalizedSourceUrl: String(note.sourceUrl || "").trim(),
      hasFileUpload: false,
      uploadEnrichment: null,
      fileDataUrl: null,
      fileName: String(note.fileName || "").trim(),
      fileMime: String(note.fileMime || "").trim(),
    };
  }

  async function enqueueEnrichmentJob(params, { throwOnError = false } = {}) {
    const noteId = String(params.noteId || "").trim();
    const workspaceId = String(params.workspaceId || "").trim();
    const visibilityUserId = String(params.visibilityUserId || "").trim() || null;
    if (!noteId || !workspaceId) {
      throw new Error("Missing note id or workspace id for enrichment queue job");
    }

    const payload = {
      noteId,
      workspaceId,
      requestedProject: String(params.requestedProject || "").trim(),
      normalizedSourceType: String(params.normalizedSourceType || "").trim() || "text",
      normalizedSourceUrl: String(params.normalizedSourceUrl || "").trim(),
      hasFileUpload: Boolean(params.hasFileUpload),
      uploadEnrichment: params.uploadEnrichment || null,
      fileDataUrl: String(params.fileDataUrl || "").trim() || null,
      fileName: String(params.fileName || "").trim(),
      fileMime: String(params.fileMime || "").trim(),
    };

    try {
      await enrichmentQueue.enqueue({
        type: ENRICH_NOTE_JOB_TYPE,
        workspaceId,
        visibilityUserId,
        payload,
      });
      return true;
    } catch (error) {
      await noteRepo.updateStatus(noteId, "failed", workspaceId).catch(() => {});
      logger.error("enrichment_job_enqueue_failed", {
        noteId,
        workspaceId,
        message: error instanceof Error ? error.message : String(error),
      });
      if (throwOnError) {
        throw error;
      }
      return false;
    }
  }

  registerEnrichmentQueueHandler();

  return {
    inferEntityTitleFromUrl,
    parseGenericDataUrl,
    inferMimeFromFileName,
    maybeDecodeTextUpload,
    saveImageDataUrl,
    mimeToExt,
    updateConsolidatedMemoryFile,
    cleanupDeletedNotesArtifacts,
    cleanupReplacedImageArtifact,
    buildEnrichmentJobParamsFromNote,
    enqueueEnrichmentJob,
    resolveEnrichmentProject,
  };
}
