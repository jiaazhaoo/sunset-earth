'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CameraRecord } from "@/lib/cameras";

declare global {
  interface Window {
    YT: any;
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
      (window as any).onYouTubeIframeAPIReady = () => resolve();
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
  onStreamError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
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
              onStreamError();
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
  const [localTime, setLocalTime] = useState<string>("");
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

  const markUnavailable = useCallback((cameraId: string) => {
    fetch("/api/camera-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraId, available: false }),
    }).catch((error) => console.warn("mark unavailable failed", error));
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

  const handleStreamFailure = useCallback(async () => {
    if (camera?.id) {
      setBlacklist((prev) =>
        prev.includes(camera.id) ? prev : [...prev, camera.id]
      );
      markUnavailable(camera.id);
    }
    await handleSwitch();
  }, [camera?.id, handleSwitch, markUnavailable]);

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

  useEffect(() => {
    if (!activeTimezone) {
      setLocalTime("Unknown");
      return;
    }
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: activeTimezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const update = () => {
      const utcNow = new Date(Date.now());
      setLocalTime(formatter.format(utcNow));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeTimezone]);

  return (
    <section className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[1.5fr,1fr]">
      <div className="flex w-full justify-center">
        <div className="aspect-video w-full max-w-[80%] overflow-hidden rounded-2xl border border-zinc-200/50 bg-black shadow-xl ring-1 ring-black/5 dark:border-zinc-700/50 dark:ring-white/5">
          {camera?.embedUrl ? (
            <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
              No playable camera right now
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full justify-center">
        <div className="flex w-full max-w-[80%] flex-col gap-4 rounded-2xl border border-zinc-200/50 bg-white/85 p-4 shadow-lg backdrop-blur-sm dark:border-zinc-700/50 dark:bg-zinc-800/90">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                  {camera?.name ?? "No active stream"}
                </h2>
                {camera?.tags?.length ? (
                  <span className="rounded-full border border-orange-200/60 bg-gradient-to-br from-orange-50 to-amber-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-500/30 dark:from-orange-950/50 dark:to-amber-950/30 dark:text-orange-300">
                    {camera.tags[0]}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>
                  {[camera?.city, camera?.country].filter(Boolean).join(" · ") ||
                    "Waiting for location..."}
                </span>
              </div>
            </div>

            <CameraActions
              cameraId={camera?.id ?? null}
              loading={loading}
              onSwitchClick={handleSwitch}
              layout="inline"
            />
          </div>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <DebugFloatingPanel
            score={cameraMeta?.score ?? null}
            label={cameraMeta?.label ?? null}
            meta={cameraMeta}
            localTime={localTime}
            timezone={activeTimezone}
          />
        )}
      </div>
    </section>
  );
}
function DebugFloatingPanel({
  score,
  label,
  meta,
  localTime,
  timezone,
}: {
  score: number | null;
  label: string | null;
  meta: CameraMeta | null;
  localTime: string;
  timezone: string | null;
}) {
  const displayEvent = pickClosestEvent(
    meta?.nextEvent ?? null,
    meta?.followingEvent ?? null
  );
  const weatherText = meta
    ? describeWeather(meta?.weatherClass)
    : { title: "Waiting for weather", subtitle: "Updating the forecast", icon: "⏳" };

  return (
    <a
      href="/dev/pools"
      className="fixed bottom-4 right-4 z-50 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm text-white shadow-2xl shadow-black/60 backdrop-blur transition-all hover:border-orange-500/50 hover:shadow-orange-500/20 cursor-pointer"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-500">
        <span>🎯</span>
        <span>Priority</span>
      </p>
      <p className="mt-1 text-2xl font-semibold">{score ?? "--"}</p>
      <p className="text-xs text-white/70 mb-3">{label ?? "No label"}</p>

      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/80">
            <span>{weatherText.icon}</span>
            <span>Weather</span>
          </p>
          <p className="mt-0.5 text-sm font-medium">{weatherText.title}</p>
          <p className="text-xs text-white/60">{weatherText.subtitle}</p>
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400/80">
            <span>🌅</span>
            <span>Sun event</span>
          </p>
          <p className="mt-0.5 text-sm font-medium">{describeEventTitle(displayEvent)}</p>
          <p className="text-xs text-white/60">{describeEventTime(displayEvent, timezone)}</p>
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/80">
            <span>🕐</span>
            <span>Local time</span>
          </p>
          <p className="mt-0.5 text-sm font-medium">{localTime || "--"}</p>
          <p className="text-xs text-white/60">{timezone ?? "No timezone"}</p>
        </div>
      </div>
    </a>
  );
}

function describeWeather(weatherClass?: string | null) {
  switch (weatherClass) {
    case "clear":
      return { title: "Clear skies", subtitle: "Crisp colors guaranteed", icon: "☀️" };
    case "partly-cloudy":
      return { title: "Partly cloudy", subtitle: "Cloud drama possible", icon: "⛅" };
    case "light-snow":
      return { title: "Light snow", subtitle: "Snowflakes add atmosphere", icon: "🌨️" };
    case "other":
    default:
      return { title: "Clouds or rain", subtitle: "Sunset glow may be muted", icon: "☁️" };
  }
}

function describeEventTitle(
  nextEvent: CameraMeta["nextEvent"] | null
) {
  if (!nextEvent) {
    return "Waiting for data";
  }
  return nextEvent.type === "sunrise" ? "Sunrise" : "Sunset";
}

function describeEventTime(
  nextEvent: CameraMeta["nextEvent"] | null,
  timezone: string | null
) {
  if (!nextEvent || !timezone) {
    return "No schedule";
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(nextEvent.timeISO));
  } catch {
    return "Invalid time";
  }
}

function pickClosestEvent(
  nextEvent: CameraMeta["nextEvent"] | null,
  followingEvent: CameraMeta["followingEvent"] | null
) {
  const events = [nextEvent, followingEvent].filter(Boolean) as Array<
    NonNullable<CameraMeta["nextEvent"]>
  >;
  if (!events.length) {
    return null;
  }
  const now = Date.now();
  const parsed = events
    .map((event) => ({
      event,
      timestamp: Date.parse(event.timeISO),
    }))
    .filter((entry) => !Number.isNaN(entry.timestamp));
  if (!parsed.length) {
    return null;
  }
  const closest = parsed.reduce((prev, curr) => {
    const prevDistance = Math.abs(prev.timestamp - now);
    const currDistance = Math.abs(curr.timestamp - now);
    return currDistance < prevDistance ? curr : prev;
  }, parsed[0]);
  return closest.event;
}

function CameraActions({
  cameraId,
  loading,
  onSwitchClick,
  layout = "stacked",
}: {
  cameraId: string | null;
  loading: boolean;
  onSwitchClick: () => void;
  layout?: "stacked" | "inline";
}) {
  const containerClasses =
    layout === "inline"
      ? "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
      : "flex flex-col gap-2";
  const primaryButtonClasses = `${
    layout === "inline" ? "w-full px-5 py-2.5 sm:w-auto" : "w-full px-6 py-3"
  } group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/40 disabled:cursor-not-allowed disabled:from-zinc-300 disabled:to-zinc-400 disabled:shadow-none dark:from-orange-600 dark:to-rose-600 dark:shadow-orange-600/20 dark:hover:shadow-orange-600/30 dark:disabled:from-zinc-700 dark:disabled:to-zinc-600`;
  return (
    <div className={containerClasses}>
      <button
        onClick={onSwitchClick}
        disabled={loading}
        className={primaryButtonClasses}
      >
        <span className="relative z-10 flex items-center gap-2">
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
        </span>
        <div className="absolute inset-0 -z-0 bg-gradient-to-r from-orange-600 to-rose-600 opacity-0 transition-opacity group-hover:opacity-100 dark:from-orange-700 dark:to-rose-700"></div>
      </button>
    </div>
  );
}
