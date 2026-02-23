import { buildNoteDescription } from "./mappers.js";
import { noteTypeIconName, renderIcon } from "./icons.js";

export function relativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function iconTypeFor(note) {
  if (note.sourceType === "image") return "image";
  if (note.sourceType === "link") return "link";
  if ((note.sourceType || "").toLowerCase() === "file") return "file";
  return "text";
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function isProcessedNote(note) {
  if (note.status === "failed") return false;
  if (note.status === "pending" || note.status === "enriching") return false;
  if (note.status === "ready") return true;
  return Boolean(String(note.summary || "").trim()) && String(note.summary || "").trim() !== "(no summary)";
}

export function getNoteProcessingState(note) {
  const normalizedStatus = String(note?.status || "")
    .trim()
    .toLowerCase();

  if (normalizedStatus === "failed") {
    return {
      status: "failed",
      dotClass: "is-failed",
      label: "Failed",
      showLabel: true,
      title: "Processing failed",
    };
  }

  if (normalizedStatus === "enriching") {
    return {
      status: "enriching",
      dotClass: "is-enriching",
      label: "Enriching",
      showLabel: true,
      title: "Enriching now",
    };
  }

  if (normalizedStatus === "pending") {
    return {
      status: "pending",
      dotClass: "is-pending",
      label: "Queued",
      showLabel: true,
      title: "Queued for enrichment",
    };
  }

  const processed = isProcessedNote(note);
  return {
    status: processed ? "ready" : "pending",
    dotClass: processed ? "is-processed" : "is-pending",
    label: processed ? "Ready" : "Queued",
    showLabel: !processed,
    title: processed ? "Processed" : "Queued for enrichment",
  };
}

export function deleteIconMarkup() {
  return renderIcon("trash", { size: 20 });
}

export function compactInlineText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildModalSummary(note) {
  const summary = String(note.summary || "").trim();
  if (summary && summary.toLowerCase() !== "(no summary)") {
    return summary;
  }
  return buildNoteDescription(note);
}

export function buildModalFullExtract(note) {
  const content = String(note.content || "").trim();
  if (content && !/^file:|^uploaded file:/i.test(content)) {
    return content;
  }
  return "";
}

export function noteTypeIconMarkup(type) {
  return renderIcon(noteTypeIconName(type), { size: 20 });
}
