import { useCallback, useEffect, useState } from 'react';

interface ApiState<T> { data: T | null; error: string | null; loading: boolean }

/** Fetches a /api/* endpoint on mount, on tab focus, and (optionally) on an interval. */
export function useApi<T>(url: string, refreshMs = 0) {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: true });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(url);
      if (!(res.headers.get('content-type') ?? '').includes('json')) {
        throw new Error('Live data only runs on Vercel (or with "vercel dev"), not in plain npm run dev.');
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setState({ data: json as T, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'Could not load', loading: false }));
    }
  }, [url]);

  useEffect(() => {
    void load();
    const id = refreshMs ? setInterval(() => document.visibilityState === 'visible' && void load(), refreshMs) : undefined;
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, refreshMs]);

  return { ...state, refresh: load };
}
