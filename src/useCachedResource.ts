import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";
import { readCache, writeCache } from "./responseCache";

/**
 * Stale-while-revalidate: returns the cached value immediately and refreshes
 * it from the API in the background. On error the last known data is kept.
 */
export function useCachedResource<T>(cacheKey: string, fetchResource: () => Promise<T>) {
  const [data, setData] = useState<T | null>(() => readCache<T>(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Latest fetcher without making `refresh` change on every render.
  const fetchResourceRef = useRef(fetchResource);
  fetchResourceRef.current = fetchResource;

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const fresh = await fetchResourceRef.current();
      setData(fresh);
      writeCache(cacheKey, fresh);
    } catch (fetchError) {
      setError(errorMessage(fetchError));
    } finally {
      setIsRefreshing(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    setData(readCache<T>(cacheKey));
    refresh();
  }, [cacheKey, refresh]);

  return { data, error, isRefreshing, refresh };
}
