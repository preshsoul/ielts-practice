// Client-side TTL cache for static content (scholarships, passages, questions)
// Complements Upstash Redis caching in Edge Functions (see supabase/functions/_shared/security.ts)

const store = new Map();

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= epochSeconds()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlSeconds = 3600) {
  store.set(key, { value, expiresAt: epochSeconds() + ttlSeconds });
}

export function cacheDelete(key) {
  return store.delete(key);
}

export function cacheClear() {
  store.clear();
}

export function cacheStats() {
  const now = epochSeconds();
  let active = 0;
  let expired = 0;
  for (const [, entry] of store) {
    if (entry.expiresAt > now) active++;
    else expired++;
  }
  return { active, expired, total: store.size };
}

// Cached fetch — wraps fetch() with TTL-based in-memory caching
// For static JSON assets that change only on redeploy
export async function cachedFetch(url, { ttlSeconds = 3600, bust = false } = {}) {
  if (!bust) {
    const cached = cacheGet(url);
    if (cached !== undefined) return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  const data = await response.json();
  cacheSet(url, data, ttlSeconds);
  return data;
}
