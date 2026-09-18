'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CameraRecord } from "@/lib/cameras";
import type { CameraMeta } from "@/lib/rankings";
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

  // Thumbnail strip: the best other cameras right now, in ranking order.
  const [others, setOthers] = useState<TopCamera[]>([]);
  useEffect(() => {
    let cancelled = false;
    const exclude = camera?.id ? `&exclude=${encodeURIComponent(camera.id)}` : "";
    fetch(`/api/top-cameras?limit=10${exclude}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cameras: [] }))
      .then((data: { cameras?: TopCamera[] }) => {
        // Belt and braces: never show the camera that is playing.
        if (!cancelled) setOthers((data.cameras ?? []).filter((c) => c.camera.id !== camera?.id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [camera?.id]);

  const pick = useCallback((item: TopCamera) => {
    setSeen((prev) => (prev.includes(item.camera.id) ? prev : [...prev, item.camera.id]));
    setCamera(item.camera);
    setCameraMeta(item.meta);
  }, []);

  return (
    <section className="flex w-full flex-col gap-3">
      {/* One line: next · conditions · where */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <button
          onClick={handleSwitch}
          disabled={loading}
          className="shrink-0 border border-line-strong px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-foreground disabled:opacity-50"
        >
          {loading ? "Switching…" : "Next camera →"}
        </button>

        <Conditions meta={cameraMeta} timezone={activeTimezone} now={now} />

        <div className="ml-auto min-w-0 text-right">
          <h1 className="truncate font-medium text-foreground">
            {camera?.name ?? "No active stream"}
            {camera?.tags?.[0] ? <span className="text-faint"> · {camera.tags[0]}</span> : null}
          </h1>
          <p className="truncate text-xs text-muted">{location || "Location pending"}</p>
        </div>
      </div>

      {/* Player — the one rounded thing on the page */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {camera?.embedUrl ? (
          <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            No playable camera right now
          </div>
        )}
        <QualityHint key={camera?.id} />
      </div>

      {/* Other cameras, ranking order */}
      {others.length ? (
        <ul className="rail -mx-4 flex gap-2 overflow-x-auto px-4 pt-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
          {others.map((item) => (
            <li key={item.camera.id} className="w-40 shrink-0 sm:w-auto">
              <button onClick={() => pick(item)} className="group block w-full text-left">
                <div className="aspect-video w-full overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${extractYoutubeId(item.camera.sourceUrl) ?? ""}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                  />
                </div>
                <p className="mt-1 truncate text-xs text-foreground">{item.camera.name}</p>
                <p className="truncate text-[11px] text-faint">
                  {[item.camera.city, item.camera.country].filter(Boolean).join(", ")}
                  {now ? ` · ${describeSunPhase(item.meta.nextEvent, item.meta.followingEvent, now, item.meta.timezone).title}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type TopCamera = { camera: CameraRecord; meta: CameraMeta };

/** Local time · light · sky, as plain text segments. */
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
  const tone =
    phase.tone === "golden" ? "text-amber-300" : phase.tone === "blue" ? "text-sky-300" : "text-foreground";

  return (
    <dl className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
      <div className="flex items-baseline gap-1.5">
        <dt className="text-xs text-faint">Local</dt>
        <dd className="tnum text-foreground">{clock}</dd>
        {zone ? <dd className="text-xs text-faint">{zone}</dd> : null}
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <dt className="text-xs text-faint">Light</dt>
        <dd className={`truncate ${tone}`}>{phase.title}</dd>
        <dd className="hidden truncate text-xs text-faint md:block">{phase.detail}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-xs text-faint">Sky</dt>
        <dd className="text-foreground">{sky.title}</dd>
      </div>
    </dl>
  );
}

/**
 * Points at the player's own settings control for picking a resolution.
 * Sits over the frame but never intercepts clicks, and fades out on its own.
 */
function QualityHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 9000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute right-3 top-3 border border-white/20 bg-black/60 px-2 py-1 text-[11px] text-white/80 backdrop-blur-sm transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      Quality: ⚙ in the player
    </div>
  );
}
