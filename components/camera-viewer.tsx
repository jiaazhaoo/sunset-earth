'use client';

import { useEffect, useRef, useState } from "react";
import type { CameraRecord } from "@/lib/cameras";

type Props = {
  initialCamera: CameraRecord | null;
};

const STORAGE_KEY = "sunset-earth-seen";
const UNAVAILABLE_KEY = "sunset-earth-unavailable";

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

function VideoFrame({
  camera,
  onStreamError,
}: {
  camera: CameraRecord;
  onStreamError: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fallbackTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
    }
    fallbackTimer.current = setTimeout(() => {
      onStreamError();
    }, 5000);
    return () => {
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current);
      }
    };
  }, [camera.embedUrl, onStreamError]);

  return (
    <iframe
      ref={iframeRef}
      key={camera.embedUrl}
      src={camera.embedUrl}
      title={camera.name}
      allow="autoplay; encrypted-media; fullscreen"
      allowFullScreen
      className="h-full w-full"
      onLoad={() => {
        if (fallbackTimer.current) {
          clearTimeout(fallbackTimer.current);
        }
        try {
          const text =
            iframeRef.current?.contentDocument?.body?.innerText ?? "";
          const unavailablePhrases = [
            "This live stream recording is not available",
            "This live event is no longer available",
            "Video unavailable",
            "Private video",
          ];
          if (unavailablePhrases.some((phrase) => text.includes(phrase))) {
            onStreamError();
          }
        } catch (error) {
          console.warn("iframe inspection failed", error);
        }
      }}
      onError={() => {
        if (fallbackTimer.current) {
          clearTimeout(fallbackTimer.current);
        }
        onStreamError();
      }}
    />
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(UNAVAILABLE_KEY);
      if (stored) {
        setBlacklist(JSON.parse(stored));
      }
    } catch {
      setBlacklist([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UNAVAILABLE_KEY, JSON.stringify(blacklist));
  }, [blacklist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        // Merge stored seen list with initial camera
        setSeen((prev) => {
          const merged = [...new Set([...prev, ...parsed])];
          return merged;
        });
      }
    } catch {
      // Keep the initial camera ID if localStorage fails
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  }, [seen]);

  useEffect(() => {
    if (camera?.id) {
      setSeen((prev) =>
        prev.includes(camera.id) ? prev : [...prev, camera.id]
      );
    }
  }, [camera?.id]);

  const buildExcludeQuery = (additional: string[] = []) => {
    const ids = [...new Set([...seen, ...blacklist, ...additional].filter(Boolean))];
    if (!ids.length) return "";
    const params = new URLSearchParams();
    params.set("exclude", ids.join(","));
    return `?${params.toString()}`;
  };

  const handleSwitch = async (additionalExclude: string[] = []) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/best-camera${buildExcludeQuery(additionalExclude)}`, {
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
  };

  const handleStreamFailure = async () => {
    if (!camera?.id) {
      console.warn("Camera stream reported a failure without active camera.");
      return;
    }
    console.warn("Camera stream reported a failure.", camera.id);
    setBlacklist((prev) =>
      prev.includes(camera.id) ? prev : [...prev, camera.id]
    );
    try {
      await fetch("/api/camera-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cameraId: camera.id,
          available: false,
        }),
      });
    } catch (error) {
      console.warn("Failed to report camera availability", error);
    }
    await handleSwitch([camera.id]);
  };

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

          <CameraMetaPanel
            meta={cameraMeta}
            localTime={localTime}
            timezone={activeTimezone}
          />
        </div>
        {process.env.NODE_ENV !== "production" && (
          <DebugFloatingPanel score={cameraMeta?.score ?? null} label={cameraMeta?.label ?? null} />
        )}
      </div>
    </section>
  );
}
function DebugFloatingPanel({
  score,
  label,
}: {
  score: number | null;
  label: string | null;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm text-white shadow-2xl shadow-black/60 backdrop-blur">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-500">
        <span>🎯</span>
        <span>Priority</span>
      </p>
      <p className="mt-1 text-2xl font-semibold">{score ?? "--"}</p>
      <p className="text-xs text-white/70">{label ?? "No label"}</p>
    </div>
  );
}

function CameraMetaPanel({
  meta,
  localTime,
  timezone,
}: {
  meta: CameraMeta | null;
  localTime: string;
  timezone: string | null;
}) {
  const displayEvent = pickUpcomingEvent(
    meta?.nextEvent ?? null,
    meta?.followingEvent ?? null
  );
  const weatherText = meta
    ? describeWeather(meta?.weatherClass)
    : { title: "Waiting for weather", subtitle: "Updating the forecast", icon: "⏳" };
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/60 to-blue-50/40 p-3 dark:border-sky-900/30 dark:from-sky-950/30 dark:to-blue-950/20">
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-sky-600/80 dark:text-sky-400/80">
          <span>{weatherText.icon}</span>
          <span>Weather</span>
        </div>
        <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {weatherText.title}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{weatherText.subtitle}</p>
      </div>

      <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/60 to-pink-50/40 p-3 dark:border-rose-900/30 dark:from-rose-950/30 dark:to-pink-950/20">
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-rose-600/80 dark:text-rose-400/80">
          <span>🌅</span>
          <span>Sun event</span>
        </div>
        <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {describeEventTitle(displayEvent)}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {describeEventTime(displayEvent, timezone)}
        </p>
      </div>

      <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-purple-50/40 p-3 dark:border-violet-900/30 dark:from-violet-950/30 dark:to-purple-950/20">
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-violet-600/80 dark:text-violet-400/80">
          <span>🕐</span>
          <span>Local time</span>
        </div>
        <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {localTime || "--"}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {timezone ?? "No timezone"}
        </p>
      </div>
    </div>
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

function pickUpcomingEvent(
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
    .filter((entry) => !Number.isNaN(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!parsed.length) {
    return null;
  }
  const future = parsed.find((entry) => entry.timestamp >= now);
  return future?.event ?? parsed[parsed.length - 1].event;
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
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const containerClasses =
    layout === "inline"
      ? "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
      : "flex flex-col gap-2";
  const primaryButtonClasses = `${
    layout === "inline" ? "w-full px-5 py-2.5 sm:w-auto" : "w-full px-6 py-3"
  } group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/40 disabled:cursor-not-allowed disabled:from-zinc-300 disabled:to-zinc-400 disabled:shadow-none dark:from-orange-600 dark:to-rose-600 dark:shadow-orange-600/20 dark:hover:shadow-orange-600/30 dark:disabled:from-zinc-700 dark:disabled:to-zinc-600`;
  const secondaryButtonClasses = `${
    layout === "inline" ? "w-full px-5 py-2.5 sm:w-auto" : "w-full px-6 py-3"
  } group flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 disabled:hover:bg-white dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-600 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600 dark:disabled:hover:bg-zinc-700`;
  const errorClasses = `${
    layout === "inline" ? "text-right" : ""
  } rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400`;

  const handleCreateRoom = async () => {
    if (!cameraId) {
      setActionError("No camera available right now.");
      return;
    }

    setCreating(true);
    setActionError(null);
    try {
      const response = await fetch("/api/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cameraId }),
      });

      if (!response.ok) {
        throw new Error("failed");
      }

      const data = (await response.json()) as { roomId: string };
      window.location.href = `/room/${data.roomId}?camera=${cameraId}`;
    } catch {
      setActionError("Failed to create a room. Please try again later.");
    } finally {
      setCreating(false);
    }
  };

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
      <button
        onClick={handleCreateRoom}
        disabled={!cameraId || creating}
        className={secondaryButtonClasses}
      >
        {creating ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Creating room…
          </>
        ) : (
          <>
            <svg className="h-4 w-4 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Watch with friends
          </>
        )}
      </button>
      {actionError && (
        <p className={errorClasses} role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
