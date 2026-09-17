"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A clock that ticks every `intervalMs`, null during SSR and the first client
 * render so server and client markup match. Built on useSyncExternalStore so
 * no effect has to call setState.
 */
export function useNow(intervalMs: number): Date | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs]
  );
  const ms = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null
  );
  return ms === null ? null : new Date(ms);
}
