"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * A small, still, light map of the camera's surroundings (OpenFreeMap's
 * Positron style — free, no key) with one warm point. Not interactive: the
 * whole thing is a link that opens the spot in Google Maps. When the camera
 * changes, the map glides to the new place instead of cutting.
 */

const STYLE = "https://tiles.openfreemap.org/styles/positron";
// Regional: the city and its surroundings, not the block.
const ZOOM = 7;

export function MiniMap({
  lat,
  lng,
  name,
  className = "",
}: {
  lat: number | null;
  lng: number | null;
  name: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);

  useEffect(() => {
    if (!container.current || lat === null || lng === null) return;
    let cancelled = false;

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !container.current) return;
      // See scripts/copy-maplibre-worker.mjs for why the worker is served here.
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      if (!map.current) {
        map.current = new maplibregl.Map({
          container: container.current,
          style: STYLE,
          center: [lng, lat],
          zoom: ZOOM,
          interactive: false,
          attributionControl: false,
          fadeDuration: 300,
        });
        map.current.on("error", (e) => console.warn("[minimap]", e.error?.message ?? e));
        const dot = document.createElement("span");
        dot.className = "minimap-dot";
        marker.current = new maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map.current);
      } else {
        map.current.flyTo({ center: [lng, lat], zoom: ZOOM, duration: 1400, essential: true });
        marker.current?.setLngLat([lng, lat]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  if (lat === null || lng === null) return null;
  const href = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;

  return (
    <div className={`shrink-0 ${className}`}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title={`${name} — open in Google Maps`}
        className="group relative block h-full w-full overflow-hidden bg-[#f2f0ea]"
      >
        <div ref={container} className="h-full w-full" />
        {/* Soft edge so the light map settles into the dark page. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(0,0,0,0.18)] transition group-hover:shadow-[inset_0_0_24px_rgba(0,0,0,0.06)]" />
      </a>
      <p className="mt-1 truncate text-right text-[9px] leading-none text-white/30">
        ©{" "}
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer noopener" className="hover:text-white/60">OpenFreeMap</a>{" "}
        ·{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener" className="hover:text-white/60">OpenStreetMap</a>
      </p>
    </div>
  );
}
