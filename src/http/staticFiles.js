import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sendText } from "./responseUtils.js";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function sanitizePath(baseDir, requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^([/\\])+/, "");
  const resolved = path.resolve(baseDir, normalized);
  if (!resolved.startsWith(baseDir)) {
    return null;
  }
  return resolved;
}

export async function serveFile(res, absolutePath) {
  try {
    const stat = await fsp.stat(absolutePath);
    if (!stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(absolutePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}
