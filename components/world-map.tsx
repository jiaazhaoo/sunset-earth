"use client";

import { useMemo } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import land110 from "world-atlas/land-110m.json";

/**
 * A small light world map with one point on it — a paper map, not a globe —
 * that opens the spot in Google Maps. Drawn as SVG from a 56 KB land outline:
 * no tiles, no keys, nothing to load.
 */

const W = 400;
const H = 200;

const LAND = feature(
  land110 as unknown as Topology,
  (land110 as unknown as Topology).objects.land as GeometryCollection
) as unknown as FeatureCollection;

const PROJECTION = geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [W - 4, H - 4],
  ],
  { type: "Sphere" }
);
const PATH = geoPath(PROJECTION);
const LAND_D = PATH(LAND) ?? "";
const SPHERE_D = PATH({ type: "Sphere" }) ?? "";

export type MapPoint = { id: string; lat: number; lng: number; name: string };

export function WorldMap({ current, className = "" }: { current: MapPoint | null; className?: string }) {
  const xy = useMemo(() => (current ? PROJECTION([current.lng, current.lat]) : null), [current]);
  const href = current
    ? `https://www.google.com/maps/search/?api=1&query=${current.lat.toFixed(5)}%2C${current.lng.toFixed(5)}`
    : undefined;

  const svg = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-full w-full"
      role="img"
      aria-label={current ? `${current.name} on a world map` : "World map"}
    >
      <path d={SPHERE_D} fill="#f4efe6" />
      <path d={LAND_D} fill="#d6cdbd" />
      {xy ? (
        <g transform={`translate(${xy[0]} ${xy[1]})`}>
          <circle r={9} fill="#ff6a3d" fillOpacity="0.25">
            <animate attributeName="r" values="5;13" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="fill-opacity" values="0.35;0" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle r={4.5} fill="#ff6a3d" stroke="#fff" strokeWidth="1.5" />
        </g>
      ) : null}
    </svg>
  );

  if (!href) return <div className={className}>{svg}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title="Open in Google Maps"
      className={`block overflow-hidden bg-[#f4efe6] transition hover:brightness-105 ${className}`}
    >
      {svg}
    </a>
  );
}
