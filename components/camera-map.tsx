'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { CameraRecord } from "@/lib/cameras";
import type {
  LatLngExpression,
  Map as LeafletMap,
  Marker,
  Polygon,
} from "leaflet";

type TerminatorOptions = {
  fillColor?: string;
  fillOpacity?: number;
  opacity?: number;
  weight?: number;
};

type TerminatorPolygon = Polygon & {
  options: TerminatorOptions;
};

type LeafletWithTerminator = LeafletModule & {
  terminator: (options?: TerminatorOptions) => TerminatorPolygon;
};

type Props = {
  camera: CameraRecord | null;
};

type LeafletModule = typeof import("leaflet");

export function CameraMap({ camera }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const terminatorRef = useRef<TerminatorPolygon | null>(null);
  const leafletRef = useRef<LeafletWithTerminator | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initialCenterRef = useRef<LatLngExpression>(
    camera?.lat != null && camera?.lng != null ? [camera.lat, camera.lng] : [20, 0]
  );
  const initialZoomRef = useRef<number>(
    camera?.lat != null && camera?.lng != null ? 5 : 2
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const leafletModule = await import("leaflet");
        const L = (leafletModule.default ?? leafletModule) as LeafletWithTerminator;
        await import("@joergdietrich/leaflet.terminator");

        if (cancelled || !containerRef.current || mapRef.current) {
          return;
        }

        // Use CDN icons so Next can load marker assets without custom handling.
        L.Icon.Default.mergeOptions({
          iconRetinaUrl:
            "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl:
            "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl:
            "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        const map = L.map(containerRef.current, {
          zoomControl: false,
          worldCopyJump: true,
        }).setView(initialCenterRef.current, initialZoomRef.current);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          minZoom: 1,
          maxZoom: 8,
          crossOrigin: true,
        }).addTo(map);

        const terminatorStyle = {
          fillColor: "#0f172a",
          fillOpacity: 0.35,
          opacity: 0,
          weight: 0,
        };
        const terminator = L.terminator(terminatorStyle);
        terminator.addTo(map);

        leafletRef.current = L;
        mapRef.current = map;
        terminatorRef.current = terminator;
        map.whenReady(() => {
          setMapReady(true);
          refreshTerminator(terminatorStyle);
          setTimeout(() => map.invalidateSize(), 100);
        });
      } catch (error) {
        console.warn("Failed to init map", error);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      terminatorRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const terminatorStyle = {
      fillColor: "#0f172a",
      fillOpacity: 0.35,
      opacity: 0,
      weight: 0,
    };
    const id = setInterval(() => {
      refreshTerminator(terminatorStyle);
    }, 60_000);
    refreshTerminator(terminatorStyle);
    return () => clearInterval(id);
  }, [mapReady]);

  const targetPosition = useMemo<LatLngExpression | null>(() => {
    if (camera?.lat != null && camera?.lng != null) {
      return [camera.lat, camera.lng];
    }
    return null;
  }, [camera?.lat, camera?.lng]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;

    if (targetPosition) {
      const position = L.latLng(targetPosition);
      if (markerRef.current) {
        markerRef.current.setLatLng(position);
      } else {
        markerRef.current = L.marker(position).addTo(map);
      }
      map.flyTo(position, 5, { duration: 0.75 });
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
      map.setView([20, 0], 2);
    }
  }, [targetPosition, mapReady]);

  const refreshTerminator = (styleOverride?: TerminatorOptions) => {
    const L = leafletRef.current;
    const terminator = terminatorRef.current;
    if (!L || !terminator) return;
    try {
      const next = L.terminator({
        fillColor: "#0f172a",
        fillOpacity: 0.35,
        opacity: 0,
        weight: 0,
        ...(styleOverride ?? {}),
      });
      terminator.setLatLngs(next.getLatLngs());
      terminator.setStyle?.({
        fillColor: next.options.fillColor,
        fillOpacity: next.options.fillOpacity,
        opacity: next.options.opacity,
        weight: next.options.weight,
      });
      terminator.redraw?.();
    } catch (error) {
      console.warn("terminator update failed", error);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
            摄像头位置
          </p>
          <h3 className="text-xl font-semibold text-zinc-900">
            当前坐标与昼夜线
          </h3>
          <p className="text-sm text-zinc-500">
            实时标记摄像头位置，并覆盖当前白天/黑夜分界线。
          </p>
        </div>
        {camera?.lat != null && camera?.lng != null ? (
          <p className="text-xs font-medium text-zinc-500">
            {camera.lat.toFixed(4)}, {camera.lng.toFixed(4)}
          </p>
        ) : (
          <p className="text-xs font-medium text-amber-600">
            坐标缺失，等待下一个摄像头
          </p>
        )}
      </div>
      <div
        ref={containerRef}
        className="h-[360px] w-full overflow-hidden rounded-xl border border-zinc-100"
      />
    </div>
  );
}
