/**
 * Shared vector utilities for semantic search and recommendations
 * Eliminates code duplication across chat, feed, search, and taste profile functions
 */

/**
 * Compute cosine similarity between two vectors
 * Returns a value between -1 and 1, where 1 means identical direction
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Parse embedding from database (handles both string and array formats)
 * Returns null if parsing fails
 */
export function parseEmbedding(emb: unknown): number[] | null {
  if (!emb) return null;
  if (Array.isArray(emb)) return emb;
  if (typeof emb === 'string') {
    try {
      return JSON.parse(emb);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalize a vector to unit length
 * Ensures consistent magnitude for comparison
 */
export function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return v;
  return v.map(x => x / norm);
}
