import { buildNoteDescription } from "./mappers.js";

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
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M8.5 3a1 1 0 0 0-1 1v.5H5.2a.8.8 0 1 0 0 1.6h.5v9.2A1.7 1.7 0 0 0 7.4 17h5.2a1.7 1.7 0 0 0 1.7-1.7V6.1h.5a.8.8 0 1 0 0-1.6h-2.3V4a1 1 0 0 0-1-1h-3Zm.6 3.1a.8.8 0 0 1 .8.8v6a.8.8 0 1 1-1.6 0v-6a.8.8 0 0 1 .8-.8Zm2.4 0a.8.8 0 0 1 .8.8v6a.8.8 0 1 1-1.6 0v-6a.8.8 0 0 1 .8-.8Z"/>
    </svg>
  `;
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
  const extracted = String(note.markdownContent || note.rawContent || "").trim();
  if (extracted) return extracted;

  const content = String(note.content || "").trim();
  if (content && !/^file:|^uploaded file:/i.test(content)) {
    return content;
  }
  return "";
}

export function noteTypeIconMarkup(type) {
  if (type === "image") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path fill="currentColor" d="M4.5 3A2.5 2.5 0 0 0 2 5.5v9A2.5 2.5 0 0 0 4.5 17h11a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 15.5 3h-11Zm8.7 3.8a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm-8.7 8V13l2.8-2.8a1 1 0 0 1 1.4 0L11 12.5l1.4-1.4a1 1 0 0 1 1.4 0l2.2 2.2v1.5h-11Z"/>
      </svg>
    `;
  }
  if (type === "link") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path fill="currentColor" d="M7.6 6.2a3 3 0 0 1 4.2 0 .8.8 0 1 1-1.1 1.1 1.4 1.4 0 0 0-2 2l.6.6a1.4 1.4 0 0 0 2 0 .8.8 0 0 1 1.1 1.1 3 3 0 0 1-4.2 0l-.6-.6a3 3 0 0 1 0-4.2Zm4.8 3.6a.8.8 0 0 1 1.1-1.1l.6.6a3 3 0 1 1-4.2 4.2.8.8 0 1 1 1.1-1.1 1.4 1.4 0 1 0 2-2l-.6-.6Z"/>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M5 2.5A2.5 2.5 0 0 0 2.5 5v10A2.5 2.5 0 0 0 5 17.5h10a2.5 2.5 0 0 0 2.5-2.5V8.8a2.5 2.5 0 0 0-.7-1.8l-3.8-3.8a2.5 2.5 0 0 0-1.8-.7H5Zm5.4 1.6L15.9 9h-4a1.5 1.5 0 0 1-1.5-1.5v-3.4Z"/>
    </svg>
  `;
}
