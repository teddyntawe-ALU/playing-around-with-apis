// Small in-memory TTL cache with least-recently-used eviction.
// Identical searches within the TTL are served without calling openFDA again, which keeps
// the app fast and protects the shared per-IP rate limit. Each app server has its own cache.
export function createCache({ ttlMs, maxEntries, now = () => Date.now() }) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    // Re-insert so Map iteration order reflects recency (oldest first).
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function set(key, value) {
    if (ttlMs <= 0 || maxEntries <= 0) return;
    store.delete(key);
    store.set(key, { value, expiresAt: now() + ttlMs });
    while (store.size > maxEntries) {
      store.delete(store.keys().next().value);
    }
  }

  return {
    get,
    set,
    clear: () => store.clear(),
    get size() {
      return store.size;
    },
  };
}
