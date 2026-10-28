"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Runs `task` once the browser is idle after the page has loaded (or after
 * two seconds where there is no idle callback, as in Safari), for code worth
 * warming before the first tap but not worth a place in the first load.
 * Returns the call that cancels it.
 */
export function whenIdle(task: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 2000);
  return () => window.clearTimeout(id);
}

/**
 * A component whose code loads after the page (performance audit B3):
 * fetched once the page is idle, or as soon as `fetchNow` is called, and
 * null until then. Held in state rather than `React.lazy`, because a lazy
 * part reveals through Suspense, which React holds back for about 300 ms on
 * first show, even when the code is already here.
 */
export function useLoadedLater<T>(load: () => Promise<{ default: T }>): [T | null, () => void] {
  const [part, setPart] = useState<T | null>(null);
  const fetchNow = useCallback(() => {
    void load().then((module) => setPart(() => module.default));
  }, [load]);
  useEffect(() => whenIdle(fetchNow), [fetchNow]);
  return [part, fetchNow];
}
