import { buildAgentNoteTitle, normalizeSingleSentence } from "../chatHelpers.js";

const RSS_FETCH_TIMEOUT_MS = 12000;
const RSS_MAX_ITEMS = 50;

function clampInt(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isPrivateIpv4(hostname = "") {
  const match = String(hostname || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((value) => Number(value));
  if (octets.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedHost(hostname = "") {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost") return true;
  if (host.endsWith(".local")) return true;
  if (host === "::1") return true;
  if (host.startsWith("fe80:")) return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (isPrivateIpv4(host)) return true;
  return false;
}

function normalizeRssUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("fetch_rss requires url");
  }

  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("fetch_rss url must be a valid absolute URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("fetch_rss supports only http(s) URLs");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("fetch_rss url host is not allowed");
  }
  return parsed.toString();
}

function decodeXmlEntities(value = "") {
  const input = String(value || "");
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const codePoint = Number.parseInt(String(hex || ""), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_match, dec) => {
      const codePoint = Number.parseInt(String(dec || ""), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function stripHtml(value = "") {
  return decodeXmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagValue(block = "", tag = "") {
  if (!block || !tag) return "";
  const pattern = new RegExp(
    `<(?:[a-z0-9_-]+:)?${String(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?${String(tag)}>`,
    "i",
  );
  const match = String(block).match(pattern);
  return match ? stripHtml(match[1]) : "";
}

function normalizeArticleUrl(rawUrl = "", feedUrl = "") {
  const candidate = String(rawUrl || "").trim();
  if (!candidate) return "";
  try {
    const resolved = new URL(candidate, feedUrl || undefined);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return "";
    return resolved.toString();
  } catch {
    return "";
  }
}

function normalizeIsoDate(rawValue = "") {
  const input = String(rawValue || "").trim();
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function parseRssItems(xml = "", feedUrl = "", maxItems = 20) {
  const source = String(xml || "");
  const matches = source.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const items = [];
  const seen = new Set();

  for (const block of matches) {
    const title = extractTagValue(block, "title");
    const link = normalizeArticleUrl(extractTagValue(block, "link"), feedUrl);
    if (!link || seen.has(link)) continue;
    seen.add(link);
    const publishedAt = normalizeIsoDate(
      extractTagValue(block, "pubDate")
      || extractTagValue(block, "date"),
    );
    const author = extractTagValue(block, "creator") || extractTagValue(block, "author");
    const summary = extractTagValue(block, "description") || extractTagValue(block, "encoded");
    items.push({
      title: title || link,
      url: link,
      author,
      publishedAt,
      summary,
    });
    if (items.length >= maxItems) break;
  }

  return items;
}

function parseAtomEntries(xml = "", feedUrl = "", maxItems = 20) {
  const source = String(xml || "");
  const matches = source.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const items = [];
  const seen = new Set();

  for (const block of matches) {
    const title = extractTagValue(block, "title");
    const hrefMatch = String(block).match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
    const linkCandidate = hrefMatch ? hrefMatch[1] : extractTagValue(block, "link");
    const link = normalizeArticleUrl(linkCandidate, feedUrl);
    if (!link || seen.has(link)) continue;
    seen.add(link);
    const publishedAt = normalizeIsoDate(
      extractTagValue(block, "published")
      || extractTagValue(block, "updated")
      || extractTagValue(block, "date"),
    );
    const author = extractTagValue(block, "name") || extractTagValue(block, "author");
    const summary = extractTagValue(block, "summary") || extractTagValue(block, "content");
    items.push({
      title: title || link,
      url: link,
      author,
      publishedAt,
      summary,
    });
    if (items.length >= maxItems) break;
  }

  return items;
}

function parseFeedItems(xml = "", feedUrl = "", maxItems = 20) {
  const rssItems = parseRssItems(xml, feedUrl, maxItems);
  if (rssItems.length > 0) return rssItems.slice(0, maxItems);
  return parseAtomEntries(xml, feedUrl, maxItems).slice(0, maxItems);
}

async function fetchFeedXml(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      },
    });
    if (!response?.ok) {
      throw new Error(`fetch_rss request failed (${response?.status || "unknown"})`);
    }
    const text = await response.text();
    if (!String(text || "").trim()) {
      throw new Error("fetch_rss feed response was empty");
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("fetch_rss request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createQueryToolHandlers({ searchMemories, fetchExternalContent } = {}) {
  const fetchImpl = typeof fetchExternalContent === "function" ? fetchExternalContent : globalThis.fetch;
  return {
    async ask_user_question(args) {
      const question = normalizeSingleSentence(args.question, 140);
      const options = Array.isArray(args.options)
        ? args.options.map((opt) => normalizeSingleSentence(opt, 60)).filter(Boolean).slice(0, 4)
        : [];
      const contextLine = normalizeSingleSentence(args.context, 120);
      const answerMode = String(args.answerMode || "").trim().toLowerCase();
      const validModes = new Set(["freeform_only", "choices_only", "choices_plus_freeform"]);
      if (!question) {
        throw new Error("ask_user_question requires question");
      }
      if (!validModes.has(answerMode)) {
        throw new Error("ask_user_question requires answerMode");
      }
      const resolvedOptions = answerMode === "choices_plus_freeform"
        ? options.filter((option) => !isGenericOtherOption(option))
        : options;
      if (answerMode !== "freeform_only" && resolvedOptions.length === 0) {
        throw new Error("ask_user_question requires options for choice answerMode");
      }
      return {
        question,
        options: answerMode === "freeform_only" ? [] : resolvedOptions,
        answerMode,
        context: contextLine,
      };
    },

    async search_notes(args, actor) {
      const results = await searchMemories({
        query: args.query,
        project: args.project || "",
        limit: 6,
        actor,
        scope: String(args.scope || "all"),
        workingSetIds: args.workingSetIds,
      });
      return {
        results: results.slice(0, 6).map((r) => ({
          id: r.note?.id,
          title: buildAgentNoteTitle(r.note, String(r.note?.content || "").slice(0, 80) || "Untitled item"),
          project: r.note?.project || "",
        })),
      };
    },

    async fetch_rss(args) {
      if (typeof fetchImpl !== "function") {
        throw new Error("fetch_rss is unavailable (no fetch implementation)");
      }
      const url = normalizeRssUrl(args?.url);
      const limit = clampInt(args?.limit, 12, { min: 1, max: RSS_MAX_ITEMS });
      const xml = await fetchFeedXml(url, fetchImpl);
      const items = parseFeedItems(xml, url, limit);
      return {
        feedUrl: url,
        count: items.length,
        items: items.map((item) => ({
          title: String(item?.title || "").trim(),
          url: String(item?.url || "").trim(),
          publishedAt: String(item?.publishedAt || "").trim(),
          author: String(item?.author || "").trim(),
          summary: String(item?.summary || "").trim(),
        })),
      };
    },
  };
}

function isGenericOtherOption(option = "") {
  const value = String(option || "").trim().toLowerCase();
  if (!value) return false;
  return /^(other|something else|anything else|else|another option|not sure|none of these|none)\b/i.test(value);
}
