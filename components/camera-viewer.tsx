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

  return (
    // Width follows the viewport height so the whole thing fits on one
    // screen: player + one line of caption, nothing to scroll to.
    <section
      className="mx-auto flex w-full flex-col gap-3"
      style={{ width: "min(100%, calc((100dvh - 12rem) * 16 / 9))" }}
    >
      <div className="grid grid-cols-[1fr_auto] items-end gap-x-6 gap-y-2 lg:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {camera?.name ?? "No active stream"}
          </h1>
          <p className="truncate text-sm text-muted">
            {camera?.tags?.[0] ? <>{camera.tags[0]} · </> : null}
            {location || "Location pending"}
          </p>
        </div>

        <div className="order-last col-span-2 lg:order-none lg:col-span-1">
          <Conditions meta={cameraMeta} timezone={activeTimezone} now={now} />
        </div>

        <button
          onClick={handleSwitch}
          disabled={loading}
          className="justify-self-end border border-amber-300/70 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-300 hover:text-black disabled:opacity-50"
        >
          {loading ? "Switching…" : "Next camera →"}
        </button>
      </div>

      {/* Player — the one rounded shape on the page, lit from below. */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 -bottom-8 -z-10 h-28 bg-gradient-to-r from-amber-500/30 via-orange-500/25 to-violet-600/30 blur-3xl"
        />
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          {camera?.embedUrl ? (
            <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              No playable camera right now
            </div>
          )}
        </div>
        <p className="pointer-events-none absolute left-full top-0 ml-5 hidden w-44 text-xs leading-relaxed text-faint 2xl:block">
          <span className="text-muted">Resolution</span>
          <br />
          Use the ⚙ in the player&apos;s control bar.
        </p>
      </div>
      <p className="-mt-1 text-right text-[11px] text-faint 2xl:hidden">
        Resolution: ⚙ in the player&apos;s control bar
      </p>
    </section>
  );
}

/** Sunset palette for the light phase: gold for golden hour, violet for blue hour. */
function toneDot(tone: "golden" | "blue" | "neutral") {
  return tone === "golden" ? "bg-amber-300" : tone === "blue" ? "bg-violet-400" : "bg-faint";
}

/** One line: local time · light · sky. */
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
    phase.tone === "neutral" ? phase.title : `${phase.title}, ${phase.detail.split(" · ")[0].toLowerCase()}`;

  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted lg:justify-center">
      <span>
        <span className="tnum text-foreground">{clock}</span>
        {zone ? <span className="ml-1 text-xs">{zone}</span> : null}
      </span>
      <span aria-hidden className="text-faint">·</span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={`inline-block h-1.5 w-1.5 ${toneDot(phase.tone)}`} />
        <span className="text-foreground">{phaseText}</span>
      </span>
      <span aria-hidden className="text-faint">·</span>
      <span className="text-foreground">{sky.title}</span>
    </p>
  );
}
