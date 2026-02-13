export const FOLDER_COLOR_TOKENS = ["green", "blue", "purple", "orange", "pink", "red", "yellow"];
export const FOLDER_SYMBOL_OPTIONS = ["DOC", "PLAN", "CODE", "LINK", "MEDIA", "NOTE"];

const LEGACY_COLOR_MAP = {
  sky: "blue",
  mint: "green",
  sand: "orange",
  rose: "pink",
  violet: "purple",
  slate: "blue",
};

export function normalizeFolderColor(value, fallback = "green") {
  const normalized = String(value || "").toLowerCase().trim();
  if (FOLDER_COLOR_TOKENS.includes(normalized)) return normalized;
  if (LEGACY_COLOR_MAP[normalized]) return LEGACY_COLOR_MAP[normalized];
  return fallback;
}

export function normalizeFolderSymbol(value, fallback = "DOC") {
  const normalized = String(value || "")
    .toUpperCase()
    .trim();
  return FOLDER_SYMBOL_OPTIONS.includes(normalized) ? normalized : fallback;
}

export function fallbackColorForFolder(name = "") {
  const total = String(name)
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return FOLDER_COLOR_TOKENS[total % FOLDER_COLOR_TOKENS.length] || "green";
}

export function normalizeFolderDrafts(rawDrafts = []) {
  const map = new Map();

  (Array.isArray(rawDrafts) ? rawDrafts : []).forEach((entry) => {
    const draft =
      typeof entry === "string"
        ? { name: entry, description: "", color: fallbackColorForFolder(entry), symbol: "DOC" }
        : {
            name: entry?.name || "",
            description: entry?.description || "",
            color: normalizeFolderColor(entry?.color, fallbackColorForFolder(entry?.name || "")),
            symbol: normalizeFolderSymbol(entry?.symbol, "DOC"),
          };

    const name = String(draft.name || "").trim();
    if (!name) return;

    map.set(name.toLowerCase(), {
      name,
      description: String(draft.description || "").trim(),
      color: normalizeFolderColor(draft.color, fallbackColorForFolder(name)),
      symbol: normalizeFolderSymbol(draft.symbol, "DOC"),
    });
  });

  return [...map.values()];
}

export function resolveFolderMeta(folderName, draftFolders) {
  const normalizedName = String(folderName || "").trim() || "General";
  const drafts = normalizeFolderDrafts(draftFolders);
  const found = drafts.find((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase());

  if (found) return found;

  return {
    name: normalizedName,
    description: "",
    color: fallbackColorForFolder(normalizedName),
    symbol: "DOC",
  };
}
