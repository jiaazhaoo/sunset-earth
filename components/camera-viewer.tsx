'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CameraRecord } from "@/lib/cameras";
import { useNow } from "@/components/use-now";
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

type CameraMeta = {
  cameraId: string;
  score: number;
  label?: string;
  isClear?: boolean;
  distanceMinutes?: number;
  weatherClass?: string;
  timezone?: string | null;
  sunrise?: string;
  sunset?: string;
  nextEvent?: {
    type: "sunrise" | "sunset";
    timeISO: string;
  } | null;
  followingEvent?: {
    type: "sunrise" | "sunset";
    timeISO: string;
  } | null;
};

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

  return (
    <section className="flex w-full flex-col gap-5">
      {/* Player */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-8 -bottom-10 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(251,146,60,0.18),transparent_70%)] blur-2xl"
        />
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-line-strong sm:rounded-3xl">
          {camera?.embedUrl ? (
            <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              No playable camera right now
            </div>
          )}
        </div>
      </div>

      {/* Title row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {camera?.name ?? "No active stream"}
            </h1>
            {camera?.tags?.[0] ? (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                {camera.tags[0]}
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{location || "Location pending"}</span>
            {camera?.sourceUrl ? (
              <>
                <span aria-hidden className="text-faint">·</span>
                <a
                  href={camera.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-faint underline-offset-4 transition hover:text-foreground hover:underline"
                >
                  Open on YouTube
                </a>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {process.env.NODE_ENV !== "production" && cameraMeta ? (
            <span className="rounded-md border border-line px-2 py-1 font-mono text-xs text-faint">
              score {cameraMeta.score}
              {cameraMeta.label ? ` · ${cameraMeta.label}` : ""}
            </span>
          ) : null}
          <CameraActions loading={loading} onSwitchClick={handleSwitch} />
        </div>
      </div>

      {/* Stats */}
      <CameraStats meta={cameraMeta} timezone={activeTimezone} now={now} />
    </section>
  );
}

function CameraStats({
  meta,
  timezone,
  now,
}: {
  meta: CameraMeta | null;
  timezone: string | null;
  now: Date | null;
}) {
  const clock = now ? formatClock(now, timezone) : "--:--";
  const zone = now ? formatZoneAbbr(timezone, now) : "";
  const phase = now
    ? describeSunPhase(meta?.nextEvent, meta?.followingEvent, now, timezone)
    : null;
  const sky = describeWeather(meta?.weatherClass);

  const toneRing =
    phase?.tone === "golden"
      ? "ring-amber-400/40 bg-amber-400/10"
      : phase?.tone === "blue"
        ? "ring-sky-400/40 bg-sky-400/10"
        : "ring-line bg-surface";

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile
        label="Local time"
        icon="🕐"
        value={<span className="tnum">{clock}</span>}
        detail={zone ? `${zone} · ${timezone}` : (timezone ?? "Timezone pending")}
      />
      <StatTile
        label="Light"
        icon={phase?.event?.type === "sunrise" ? "🌅" : "🌇"}
        value={phase?.title ?? "—"}
        detail={phase?.detail ?? "Waiting for sun times"}
        className={toneRing}
      />
      <StatTile label="Sky" icon={sky.icon} value={sky.title} detail={sky.detail} />
    </dl>
  );
}

function StatTile({
  label,
  icon,
  value,
  detail,
  className = "ring-line bg-surface",
}: {
  label: string;
  icon: string;
  value: React.ReactNode;
  detail: string;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-4 ring-1 ${className}`}>
      <span aria-hidden className="mt-0.5 text-xl leading-none">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-lg font-semibold text-foreground">{value}</dd>
        <dd className="truncate text-xs text-muted">{detail}</dd>
      </div>
    </div>
  );
}

function CameraActions({
  loading,
  onSwitchClick,
}: {
  loading: boolean;
  onSwitchClick: () => void;
}) {
  return (
    <button
      onClick={onSwitchClick}
      disabled={loading}
      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:shadow-xl hover:shadow-orange-500/30 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-600 disabled:shadow-none sm:w-auto"
    >
      {loading ? (
        <>
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Switching…
        </>
      ) : (
        <>
          <svg className="h-4 w-4 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Next camera
        </>
      )}
    </button>
  );
}
