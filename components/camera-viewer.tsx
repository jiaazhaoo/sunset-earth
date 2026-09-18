'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CameraRecord } from "@/lib/cameras";
import type { CameraMeta } from "@/lib/rankings";
import { useNow } from "@/components/use-now";
import { WorldMap, type MapPoint } from "@/components/world-map";
import {
  describeSunPhase,
  describeWeather,
  formatClock,
  formatZoneAbbr,
} from "@/lib/sun-format";

/** The slice of the YouTube IFrame API this component touches. */
type YTPlayer = {
  destroy(): void;
  mute?(): void;
  playVideo?(): void;
  getPlayerState?(): number;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onError?: (event: { data: number }) => void;
        onStateChange?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
};

declare global {
  interface Window {
    YT: YTNamespace;
    onYouTubeIframeAPIReady: () => void;
  }
}

type Props = {
  initialCamera: CameraRecord | null;
};

// No persistent seen/blacklist to avoid surprising excludes across sessions

type BestCameraResponse = {
  camera: CameraRecord;
  rotationReset?: boolean;
  meta?: CameraMeta | null;
};

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeAPI() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!ytApiPromise) {
    ytApiPromise = new Promise<void>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.body.appendChild(script);
      window.onYouTubeIframeAPIReady = () => resolve();
    });
  }
  return ytApiPromise;
}

function extractYoutubeId(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace("/", "") || null;
    }
    if (parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }
    const parts = parsed.pathname.split("/");
    const embedIndex = parts.findIndex((p) => p === "embed" || p === "live");
    if (embedIndex >= 0 && parts[embedIndex + 1]) {
      return parts[embedIndex + 1];
    }
  } catch (error) {
    console.warn("Failed to parse youtube id", error);
  }
  return null;
}

function VideoFrame({
  camera,
  onStreamError,
}: {
  camera: CameraRecord;
  /** errorCode is the YouTube IFrame API code; undefined for timeouts. */
  onStreamError: (errorCode?: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const fallbackTimer = useRef<NodeJS.Timeout | null>(null);
  const videoId = extractYoutubeId(camera.embedUrl || camera.sourceUrl);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      if (!containerRef.current || !videoId) {
        onStreamError();
        return;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      await loadYouTubeAPI();
      if (cancelled) return;
      try {
        const player = new window.YT.Player(containerRef.current, {
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            modestbranding: 1,
            controls: 1,
            fs: 1,
          },
          events: {
            onReady: () => {
              player.mute?.();
              player.playVideo?.();
              if (fallbackTimer.current) {
                clearTimeout(fallbackTimer.current);
              }
              fallbackTimer.current = setTimeout(() => {
                onStreamError();
              }, 5000);
            },
            onError: (event: { data: number }) => {
              console.warn("youtube player error", event.data);
              onStreamError(event.data);
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                if (fallbackTimer.current) {
                  clearTimeout(fallbackTimer.current);
                }
              }
            },
          },
        });
        playerRef.current = player;
      } catch (error) {
        console.warn("create player failed", error);
        onStreamError();
      }
    };
    setup();
    return () => {
      cancelled = true;
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, camera.id, onStreamError]);

  return (
    <div className="h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label={camera.name}
      />
    </div>
  );
}

export function CameraViewer({ initialCamera }: Props) {
  const [camera, setCamera] = useState<CameraRecord | null>(initialCamera);
  const [cameraMeta, setCameraMeta] = useState<CameraMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>(
    initialCamera?.id ? [initialCamera.id] : []
  );
  const [blacklist, setBlacklist] = useState<string[]>([]);

  const excludeQuery = useMemo(() => {
    const ids = [...new Set([...seen, ...blacklist])];
    if (!ids.length) return "";
    const params = new URLSearchParams();
    params.set("exclude", ids.join(","));
    return `?${params.toString()}`;
  }, [seen, blacklist]);

  // Report a real player error so the server can re-verify the stream. Local
  // timeouts are handled purely client-side via the blacklist: they usually
  // mean this browser (autoplay policy, extensions, network), not the camera.
  const reportPlayerError = useCallback((cameraId: string, errorCode: number) => {
    fetch("/api/camera-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraId, errorCode }),
    }).catch((error) => console.warn("report player error failed", error));
  }, []);

  const handleSwitch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/best-camera${excludeQuery}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Request failed");
      }

      const payload = (await response.json()) as BestCameraResponse;
      if (payload.rotationReset) {
        setSeen(payload.camera.id ? [payload.camera.id] : []);
      } else if (payload.camera.id) {
        setSeen((prev) =>
          prev.includes(payload.camera.id)
            ? prev
            : [...prev, payload.camera.id]
        );
      }
      setCamera(payload.camera);
      setCameraMeta(payload.meta ?? null);
    } catch {
      setError("Unable to load another camera right now. Please try again soon.");
    } finally {
      setLoading(false);
    }
  }, [excludeQuery]);

  const handleStreamFailure = useCallback(
    async (errorCode?: number) => {
      if (camera?.id) {
        setBlacklist((prev) =>
          prev.includes(camera.id) ? prev : [...prev, camera.id]
        );
        if (typeof errorCode === "number") {
          reportPlayerError(camera.id, errorCode);
        }
      }
      await handleSwitch();
    },
    [camera?.id, handleSwitch, reportPlayerError]
  );

  useEffect(() => {
    if (!camera?.id) {
      setCameraMeta(null);
      return;
    }
    if (cameraMeta?.cameraId === camera.id) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/best-camera?cameraId=${camera.id}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as BestCameraResponse;
        if (!cancelled) {
          setCameraMeta(payload.meta ?? null);
        }
      } catch (err) {
        console.warn("fetch camera meta failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camera?.id, cameraMeta?.cameraId]);

  const activeTimezone =
    camera?.timezone ?? cameraMeta?.timezone ?? null;


  const now = useNow(1000);

  const location = [camera?.city, camera?.country].filter(Boolean).join(", ");

  const videoId = extractYoutubeId(camera?.sourceUrl ?? camera?.embedUrl);

  // Every live camera as a faint dot on the map; the one playing glows.
  const [points, setPoints] = useState<MapPoint[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cameras", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cameras: [] }))
      .then((data: { cameras?: CameraRecord[] }) => {
        if (cancelled) return;
        setPoints(
          (data.cameras ?? [])
            .filter((c) => c.linkAvailable !== false && c.lat !== null && c.lng !== null)
            .map((c) => ({ id: c.id, lat: c.lat as number, lng: c.lng as number, name: c.name }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const pickById = useCallback(async (id: string) => {
    if (id === camera?.id) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/best-camera?cameraId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as BestCameraResponse;
      setSeen((prev) => (prev.includes(payload.camera.id) ? prev : [...prev, payload.camera.id]));
      setCamera(payload.camera);
      setCameraMeta(payload.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [camera?.id]);

  const here: MapPoint | null =
    camera && camera.lat !== null && camera.lng !== null
      ? { id: camera.id, lat: camera.lat, lng: camera.lng, name: camera.name }
      : null;

  return (
    <>
      {/* The stream's cover, blurred, colours the whole page. */}
      <div className="ambient" aria-hidden>
        {videoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={videoId} src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" />
        ) : null}
      </div>

      <section
        className="mx-auto flex w-full flex-col"
        style={{ width: "min(100%, calc((100dvh - 19rem) * 16 / 9))" }}
      >
        {/* Player — the one rounded shape on the page. */}
        <div className="relative">
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
            {camera?.embedUrl ? (
              <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
                No playable camera right now
              </div>
            )}
          </div>
          <p className="pointer-events-none absolute left-full top-0 ml-6 hidden w-40 text-[11px] leading-relaxed text-white/35 2xl:block">
            Resolution: the ⚙ in the player&apos;s control bar.
          </p>
        </div>

        {/* Caption: a small globe, the words, the button */}
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-5">
            <WorldMap
              current={here}
              others={points.filter((p) => p.id !== camera?.id)}
              now={now}
              onPick={pickById}
              className="h-24 w-24 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-serif text-4xl leading-none tracking-tight text-white sm:truncate sm:text-5xl">
                {camera?.name ?? "No active stream"}
              </h1>
              <p className="mt-2 text-sm text-white/55">
                {location || "Location pending"}
                {camera?.tags?.[0] ? <span className="text-white/35"> · {camera.tags[0]}</span> : null}
              </p>
              <Conditions meta={cameraMeta} timezone={activeTimezone} now={now} />
            </div>
          </div>

          <button
            onClick={handleSwitch}
            disabled={loading}
            className="group shrink-0 self-start border border-white/25 px-5 py-2.5 text-sm text-white transition hover:border-amber-200 hover:text-amber-200 disabled:opacity-50 sm:self-end"
          >
            {loading ? "Switching…" : "Next camera"}
            <span aria-hidden className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      </section>
    </>
  );
}

/** One line under the name: local time · light · sky, with a sun-position bar. */
function Conditions({
  meta,
  timezone,
  now,
}: {
  meta: CameraMeta | null;
  timezone: string | null;
  now: Date | null;
}) {
  if (!now) return null;
  const clock = formatClock(now, timezone);
  const zone = formatZoneAbbr(timezone, now);
  const phase = describeSunPhase(meta?.nextEvent, meta?.followingEvent, now, timezone);
  const sky = describeWeather(meta?.weatherClass);
  const phaseText =
    phase.tone === "neutral" ? phase.title : `${phase.title} — ${phase.detail.split(" · ")[0].toLowerCase()}`;
  const accent = phase.tone === "golden" ? "text-amber-300" : phase.tone === "blue" ? "text-violet-300" : "text-white/85";

  // Where the local day is: sunrise at 0, sunset at 1, night beyond.
  const sunrise = meta?.sunrise ? Date.parse(meta.sunrise) : NaN;
  const sunset = meta?.sunset ? Date.parse(meta.sunset) : NaN;
  const progress =
    Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise
      ? Math.max(0, Math.min(1, (now.getTime() - sunrise) / (sunset - sunrise)))
      : null;

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <p className="flex flex-wrap items-center gap-x-3 text-sm text-white/70">
        <span>
          <span className="tnum text-white">{clock}</span>
          {zone ? <span className="ml-1 text-xs text-white/45">{zone}</span> : null}
        </span>
        <span aria-hidden className="text-white/25">·</span>
        <span className={accent}>{phaseText}</span>
        <span aria-hidden className="text-white/25">·</span>
        <span>{sky.title}</span>
      </p>
      {progress !== null ? (
        <div className="relative h-px w-56 max-w-full bg-gradient-to-r from-violet-500/70 via-amber-300 to-violet-500/70" aria-hidden>
          <span
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-amber-200 shadow-[0_0_10px_rgba(253,230,138,0.9)]"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
