const VALID_SOURCE_TYPES = new Set(["text", "link", "image", "file"]);
const MAX_CONTENT_LENGTH = 100000;
const MAX_PROJECT_LENGTH = 120;
const MAX_TAG_LENGTH = 60;
const MAX_TAGS = 20;

export function validateNotePayload(body, { requireContent = true } = {}) {
  const errors = [];

  if (requireContent) {
    if (!body.content && !body.fileDataUrl && !body.imageDataUrl && !body.sourceUrl) {
      errors.push("At least one of content, fileDataUrl, imageDataUrl, or sourceUrl is required");
    }
  }

  if (body.content !== undefined && typeof body.content !== "string") {
    errors.push("content must be a string");
  }

  if (typeof body.content === "string" && body.content.length > MAX_CONTENT_LENGTH) {
    errors.push(`content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`);
  }

  if (body.sourceType !== undefined && !VALID_SOURCE_TYPES.has(body.sourceType)) {
    errors.push(`sourceType must be one of: ${[...VALID_SOURCE_TYPES].join(", ")}`);
  }

  if (body.project !== undefined) {
    if (typeof body.project !== "string") {
      errors.push("project must be a string");
    } else if (body.project.length > MAX_PROJECT_LENGTH) {
      errors.push(`project exceeds maximum length of ${MAX_PROJECT_LENGTH} characters`);
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      errors.push("tags must be an array");
    } else {
      if (body.tags.length > MAX_TAGS) {
        errors.push(`tags array exceeds maximum of ${MAX_TAGS} items`);
      }
      for (let i = 0; i < body.tags.length; i++) {
        if (typeof body.tags[i] !== "string") {
          errors.push(`tags[${i}] must be a string`);
          break;
        }
        if (body.tags[i].length > MAX_TAG_LENGTH) {
          errors.push(`tags[${i}] exceeds maximum length of ${MAX_TAG_LENGTH} characters`);
          break;
        }
      }
    }
  }

  if (body.summary !== undefined && typeof body.summary !== "string") {
    errors.push("summary must be a string");
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [] };
}

export function validateBatchPayload(body) {
  const errors = [];

  if (!Array.isArray(body.ids)) {
    errors.push("ids must be an array");
  } else if (body.ids.length === 0) {
    errors.push("ids array must not be empty");
  } else if (body.ids.length > 200) {
    errors.push("ids array exceeds maximum of 200 items");
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [] };
}
