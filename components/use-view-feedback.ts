"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

const SKIP_MS = 5_000;
const DWELL_MS = 180_000;

type ViewEvent = "skip" | "dwell" | "fav" | "unfav";

function report(cameraId: string, event: ViewEvent) {
  const body = JSON.stringify({ cameraId, event });
  try {
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Watching, turned into two anonymous signals per camera: leaving within
 * five seconds (a skip) and staying three minutes with the tab in front (a
 * stay). Only a switch the viewer asked for can be a skip — TV mode and
 * stream failures move on by themselves — so callers announce those with
 * `leaving()` just before switching. Saves are reported as they happen.
 * Counts only; the server never learns who watched (app/api/events).
 */
export function useViewFeedback(cameraId: string | null) {
  const shownAt = useRef<number | null>(null);
  const current = useRef<string | null>(null);

  useEffect(() => {
    current.current = cameraId;
    shownAt.current = cameraId ? Date.now() : null;
    if (!cameraId) return;
    const timer = setTimeout(() => {
      if (current.current === cameraId && document.visibilityState === "visible") {
        report(cameraId, "dwell");
      }
    }, DWELL_MS);
    return () => clearTimeout(timer);
  }, [cameraId]);

  const leaving = useCallback(() => {
    const id = current.current;
    const t0 = shownAt.current;
    if (id && t0 !== null && Date.now() - t0 < SKIP_MS) report(id, "skip");
  }, []);

  const saved = useCallback((id: string, on: boolean) => report(id, on ? "fav" : "unfav"), []);

  return useMemo(() => ({ leaving, saved }), [leaving, saved]);
}
