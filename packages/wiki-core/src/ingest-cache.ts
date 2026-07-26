export interface IngestCacheEntry {
  sourceIdentity: string;
  sourceHash: string;
  timestamp: number;
  filesWritten: string[];
}

export function loadCache(json: string): Map<string, IngestCacheEntry> {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.map((entry: IngestCacheEntry) => [entry.sourceIdentity, entry]));
  } catch {
    return new Map();
  }
}

export function dumpCache(cache: Map<string, IngestCacheEntry>): string {
  return JSON.stringify([...cache.values()], null, 2);
}

export function checkCache(
  cache: Map<string, IngestCacheEntry>,
  sourceIdentity: string,
  sourceHash: string,
): string[] | null {
  const entry = cache.get(sourceIdentity);
  if (entry?.sourceHash !== sourceHash) return null;
  return entry.filesWritten;
}

export function saveCache(
  cache: Map<string, IngestCacheEntry>,
  sourceIdentity: string,
  sourceHash: string,
  filesWritten: string[],
): void {
  cache.set(sourceIdentity, {
    sourceIdentity,
    sourceHash,
    timestamp: Date.now(),
    filesWritten,
  });
}

export function removeFromCache(
  cache: Map<string, IngestCacheEntry>,
  sourceIdentity: string,
): void {
  cache.delete(sourceIdentity);
}
