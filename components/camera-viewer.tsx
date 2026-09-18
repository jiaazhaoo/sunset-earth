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
    <section className="flex w-full flex-col gap-4">
      {/* Status line: next · conditions · where */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <button
          onClick={handleSwitch}
          disabled={loading}
          className="shrink-0 bg-gradient-to-r from-amber-300 via-orange-400 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Switching…" : "Next camera →"}
        </button>

        <Conditions meta={cameraMeta} timezone={activeTimezone} now={now} />

        <div className="ml-auto min-w-0 text-right">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {camera?.name ?? "No active stream"}
          </h1>
          <p className="truncate text-xs text-muted">
            {camera?.tags?.[0] ? <span className="text-amber-300/80">{camera.tags[0]}</span> : null}
            {camera?.tags?.[0] && location ? " · " : ""}
            {location || "Location pending"}
          </p>
        </div>
      </div>

      {/* Player — the one rounded thing on the page */}
      <div className="relative">
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          {camera?.embedUrl ? (
            <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              No playable camera right now
            </div>
          )}
        </div>
        {/* Resolution note: beside the frame where there is room, under it otherwise. */}
        <p className="pointer-events-none absolute left-full top-0 ml-5 hidden w-44 text-xs leading-relaxed text-faint 2xl:block">
          <span className="text-muted">Resolution</span>
          <br />
          Use the ⚙ in the player&apos;s control bar.
        </p>
      </div>
      <p className="-mt-2 text-right text-[11px] text-faint 2xl:hidden">
        Resolution: ⚙ in the player&apos;s control bar
      </p>

      {/* Other cameras, ranking order */}
      {others.length ? (
        <ul className="rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
          {others.map((item) => {
            const phase = now
              ? describeSunPhase(item.meta.nextEvent, item.meta.followingEvent, now, item.meta.timezone)
              : null;
            return (
              <li key={item.camera.id} className="w-40 shrink-0 sm:w-auto">
                <button onClick={() => pick(item)} className="group block w-full text-left">
                  <div className="aspect-video w-full overflow-hidden bg-black ring-1 ring-transparent transition group-hover:ring-amber-300/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${extractYoutubeId(item.camera.sourceUrl) ?? ""}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover opacity-85 transition group-hover:opacity-100"
                    />
                  </div>
                  <p className="mt-1.5 truncate text-sm text-foreground">{item.camera.name}</p>
                  <p className="truncate text-[11px] text-faint">
                    {[item.camera.city, item.camera.country].filter(Boolean).join(", ")}
                    {phase ? (
                      <>
                        {" · "}
                        <span className={toneClass(phase.tone, "text-faint")}>{phase.title}</span>
                      </>
                    ) : null}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

type TopCamera = { camera: CameraRecord; meta: CameraMeta };

/** Sunset palette for the light phase: gold for golden hour, violet for blue hour. */
function toneClass(tone: "golden" | "blue" | "neutral", neutral = "text-foreground") {
  return tone === "golden" ? "text-amber-300" : tone === "blue" ? "text-violet-300" : neutral;
}

/** Local time · light · sky — small label over a larger value. */
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

  return (
    <dl className="flex min-w-0 flex-wrap items-end gap-x-7 gap-y-2">
      <div>
        <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">Local time</dt>
        <dd className="text-base leading-tight text-foreground">
          <span className="tnum font-medium">{clock}</span>
          {zone ? <span className="ml-1.5 text-xs text-faint">{zone}</span> : null}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">Light</dt>
        <dd className="truncate text-base leading-tight">
          <span className={`font-medium ${toneClass(phase.tone)}`}>{phase.title}</span>
          <span className="ml-1.5 hidden text-xs text-faint md:inline">{phase.detail}</span>
        </dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">Sky</dt>
        <dd className="text-base font-medium leading-tight text-foreground">{sky.title}</dd>
      </div>
    </dl>
  );
}
