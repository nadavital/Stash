function toText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) index += 1;
  return index;
}

function commonSuffixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[a.length - 1 - index] === b[b.length - 1 - index]) {
    index += 1;
  }
  return index;
}

function computeSinglePatch(base, edited) {
  if (base === edited) return null;
  const prefix = commonPrefixLength(base, edited);
  const baseTail = base.slice(prefix);
  const editedTail = edited.slice(prefix);
  const suffix = commonSuffixLength(baseTail, editedTail);
  return {
    start: prefix,
    end: base.length - suffix,
    insert: edited.slice(prefix, edited.length - suffix),
  };
}

function sortPatches(patchA, patchB) {
  if (patchA.start < patchB.start) return [patchA, patchB];
  if (patchB.start < patchA.start) return [patchB, patchA];
  if (patchA.end < patchB.end) return [patchA, patchB];
  return [patchB, patchA];
}

function arePatchesDisjoint(first, second) {
  if (first.end < second.start) return true;
  if (first.end > second.start) return false;

  // Concurrent insertions at the exact same base position are ambiguous.
  const sameInsertionPoint = first.start === first.end
    && second.start === second.end
    && first.start === second.start;
  return !sameInsertionPoint;
}

function applyPatches(base, patches) {
  let merged = base;
  let offset = 0;
  patches.forEach((patch) => {
    const start = patch.start + offset;
    const end = patch.end + offset;
    merged = `${merged.slice(0, start)}${patch.insert}${merged.slice(end)}`;
    offset += patch.insert.length - (patch.end - patch.start);
  });
  return merged;
}

/**
 * Three-way merge helper for optimistic client rebases.
 *
 * Returns `{ status, text }` where:
 * - `same`: local/remote are identical
 * - `local`: only local changed vs base
 * - `remote`: only remote changed vs base
 * - `merged`: both changed in disjoint ranges and were auto-merged
 * - `conflict`: overlapping/ambiguous edits (caller should ask for manual resolution)
 */
export function mergeTextWithBase(baseText, localText, remoteText) {
  const base = toText(baseText);
  const local = toText(localText);
  const remote = toText(remoteText);

  if (local === remote) return { status: "same", text: local };
  if (local === base) return { status: "remote", text: remote };
  if (remote === base) return { status: "local", text: local };

  const localPatch = computeSinglePatch(base, local);
  const remotePatch = computeSinglePatch(base, remote);
  if (!localPatch || !remotePatch) {
    return { status: "conflict", text: local };
  }

  if (localPatch.start === remotePatch.start && localPatch.end === remotePatch.end) {
    if (localPatch.insert === remotePatch.insert) {
      return { status: "same", text: local };
    }
    return { status: "conflict", text: local };
  }

  const [first, second] = sortPatches(localPatch, remotePatch);
  if (!arePatchesDisjoint(first, second)) {
    return { status: "conflict", text: local };
  }

  const merged = applyPatches(base, [first, second]);
  if (merged === local) return { status: "local", text: local };
  if (merged === remote) return { status: "remote", text: remote };
  return { status: "merged", text: merged };
}
