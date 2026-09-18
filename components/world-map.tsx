"use client";

import { useMemo } from "react";
import { geoOrthographic, geoPath, geoCircle, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import land110 from "world-atlas/land-110m.json";
import { subsolarPoint } from "@/lib/sun-position";

/**
 * A small globe, turned so the playing camera is at its centre: land as a
 * faint silhouette, the night side shaded, one glowing point, faint points
 * for the other cameras on this hemisphere. Drawn as SVG from a 56 KB land
 * outline — no tiles, no keys, nothing to load.
 */

const W = 200;
const H = 200;

const LAND = feature(
  land110 as unknown as Topology,
  (land110 as unknown as Topology).objects.land as GeometryCollection
) as unknown as FeatureCollection;

export type MapPoint = { id: string; lat: number; lng: number; name: string };

export function WorldMap({
  current,
  others = [],
  now,
  onPick,
  className = "",
}: {
  current: MapPoint | null;
  others?: MapPoint[];
  now: Date | null;
  onPick?: (id: string) => void;
  className?: string;
}) {
  // Turn the globe so the camera sits at the centre of the visible hemisphere.
  const projection = useMemo(
    () =>
      geoOrthographic()
        .rotate([current ? -current.lng : 0, current ? -current.lat : 0])
        .translate([W / 2, H / 2])
        .scale(W / 2 - 2)
        .clipAngle(90),
    [current]
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const night = useMemo(() => {
    if (!now) return null;
    const sun = subsolarPoint(now);
    const anti: [number, number] = [sun.lng + 180, -sun.lat];
    // Night (sun below −6°… drawn as concentric caps: civil, nautical, night).
    return [96, 102, 108].map((r) => path(geoCircle().center(anti).radius(r)()) ?? "");
  }, [now, path]);

  const sphere = path({ type: "Sphere" }) ?? "";
  const land = path(LAND) ?? "";
  const graticule = path(geoGraticule10()) ?? "";
  const cur = current ? projection([current.lng, current.lat]) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={current ? `Map: ${current.name}` : "World map"}
    >
      <defs>
        <clipPath id="sphere-clip">
          <path d={sphere} />
        </clipPath>
        <radialGradient id="sun-glow">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={sphere} fill="rgba(255,255,255,0.04)" />
      <g clipPath="url(#sphere-clip)">
        <path d={graticule} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
        <path d={land} fill="rgba(255,255,255,0.22)" />
        {night?.map((d, i) => (
          <path key={i} d={d} fill="rgba(0,0,0,0.26)" />
        ))}

        {others.map((p) => {
          // Only points on the visible hemisphere project; the rest return null.
          const xy = projection([p.lng, p.lat]);
          if (!xy) return null;
          return (
            <circle
              key={p.id}
              cx={xy[0]}
              cy={xy[1]}
              r={1.6}
              fill="rgba(255,255,255,0.45)"
              className={onPick ? "cursor-pointer hover:fill-amber-200" : ""}
              onClick={onPick ? () => onPick(p.id) : undefined}
            >
              <title>{p.name}</title>
            </circle>
          );
        })}

        {cur ? (
          <g transform={`translate(${cur[0]} ${cur[1]})`}>
            <circle r={12} fill="url(#sun-glow)" />
            <circle r={6} fill="none" stroke="#fde68a" strokeOpacity="0.5" strokeWidth="0.8">
              <animate attributeName="r" values="3;10" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.6;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r={2.5} fill="#fde68a" />
          </g>
        ) : null}
      </g>
      <path d={sphere} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />
    </svg>
  );
}
