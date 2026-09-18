"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Saved camera ids, kept in this browser only. */
const KEY = "sunset-earth:favourites";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let cache: string[] = [];
let cacheKey = "";
function snapshot(): string[] {
  const list = read();
  const key = list.join("|");
  if (key !== cacheKey) {
    cache = list;
    cacheKey = key;
  }
  return cache;
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  listeners.forEach((l) => l());
}

export function useFavourites() {
  const favourites = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    snapshot,
    () => [] as string[]
  );
  const toggle = useCallback((id: string) => {
    const list = read();
    write(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }, []);
  const has = useCallback((id: string) => favourites.includes(id), [favourites]);
  return { favourites, toggle, has };
}
