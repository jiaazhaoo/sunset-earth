"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The whole network on one interactive map (OpenFreeMap's dark style, no
 * key): a dot per live camera, coloured by its light right now — gold in
 * golden hour, violet in blue hour, white by day, dim at night. Click to
 * watch. Drag and scroll like any map.
 */

const STYLE = "https://tiles.openfreemap.org/styles/dark";

export type ExploreDot = {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  tone: "golden" | "blue" | "day" | "night";
  headline: string;
};

const TONE_COLOUR: Record<ExploreDot["tone"], string> = {
  golden: "#fcd34d",
  blue: "#a78bfa",
  day: "#e5e7eb",
  night: "#52525b",
};

export function ExploreMap({ dots, onPick, className = "" }: { dots: ExploreDot[]; onPick: (id: string) => void; className?: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!container.current || map.current) return;
    let cancelled = false;
    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !container.current || map.current) return;
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      map.current = new maplibregl.Map({
        container: container.current,
        style: STYLE,
        center: [10, 30],
        zoom: 1.4,
        minZoom: 1,
        attributionControl: false,
        dragRotate: false,
      });
      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep markers in sync with the dots (colour changes as the sun moves).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let cancelled = false;
    import("maplibre-gl").then((maplibregl) => {
      if (cancelled) return;
      const seen = new Set<string>();
      for (const dot of dots) {
        seen.add(dot.id);
        let marker = markers.current.get(dot.id);
        if (!marker) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "explore-dot";
          el.addEventListener("click", () => pick.current(dot.id));
          marker = new maplibregl.Marker({ element: el }).setLngLat([dot.lng, dot.lat]).addTo(m);
          markers.current.set(dot.id, marker);
        }
        const el = marker.getElement();
        el.style.setProperty("--dot", TONE_COLOUR[dot.tone]);
        el.dataset.tone = dot.tone;
        el.title = `${dot.name}${dot.city ? `, ${dot.city}` : ""} — ${dot.headline}`;
        el.setAttribute("aria-label", el.title);
      }
      for (const [id, marker] of markers.current) {
        if (!seen.has(id)) {
          marker.remove();
          markers.current.delete(id);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dots]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  return <div ref={container} className={`h-full w-full bg-[#111] ${className}`} />;
}
