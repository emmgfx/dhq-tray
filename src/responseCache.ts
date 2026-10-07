// Last known API responses, persisted so lists render instantly on next open.
// Storage can be unavailable or full; the cache is best-effort only.

const KEY_PREFIX = "dhq-tray:cache:v1:";

export function readCache<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(KEY_PREFIX + key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore: next open just fetches again.
  }
}

/** Drops every cached response, e.g. when the account changes. */
export function clearCache() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(KEY_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore.
  }
}
