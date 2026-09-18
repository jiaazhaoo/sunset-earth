'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CameraRecord } from "@/lib/cameras";
import type { CameraMeta } from "@/lib/rankings";
import { useNow } from "@/components/use-now";
import { MiniMap } from "@/components/mini-map";
import { useFavourites } from "@/components/use-favourites";
import { goldenNow, headlineFor, upcoming, type ScheduledCamera } from "@/lib/sun-schedule";
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

type LiveCamera = ScheduledCamera & { lat: number | null; lng: number | null; videoId: string | null; tag: string | null };

/** How long TV mode stays on one camera before moving to the next. */
const TV_DWELL_MS = 4 * 60_000;
const TV_KEY = "sunset-earth:tv";

export function CameraViewer({ initialCamera }: Props) {
  const [camera, setCamera] = useState<CameraRecord | null>(initialCamera);
  const [cameraMeta, setCameraMeta] = useState<CameraMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>(
    initialCamera?.id ? [initialCamera.id] : []
  );
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [fading, setFading] = useState(false);

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

  // A short dip to black so a change of camera reads as a cut, not a glitch.
  const withFade = useCallback(async (change: () => Promise<void>) => {
    setFading(true);
    await new Promise((r) => setTimeout(r, 350));
    await change();
    setTimeout(() => setFading(false), 250);
  }, []);

  const adopt = useCallback((payload: BestCameraResponse) => {
    if (payload.rotationReset) {
      setSeen(payload.camera.id ? [payload.camera.id] : []);
    } else if (payload.camera.id) {
      setSeen((prev) => (prev.includes(payload.camera.id) ? prev : [...prev, payload.camera.id]));
    }
    setCamera(payload.camera);
    setCameraMeta(payload.meta ?? null);
  }, []);

  const handleSwitch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await withFade(async () => {
        const response = await fetch(`/api/best-camera${excludeQuery}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Request failed");
        adopt((await response.json()) as BestCameraResponse);
      });
    } catch {
      setError("Unable to load another camera right now. Please try again soon.");
    } finally {
      setLoading(false);
    }
  }, [excludeQuery, withFade, adopt]);

  const switchTo = useCallback(
    async (id: string) => {
      if (!id || id === camera?.id) return;
      setLoading(true);
      try {
        await withFade(async () => {
          const response = await fetch(`/api/best-camera?cameraId=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (!response.ok) return;
          adopt((await response.json()) as BestCameraResponse);
        });
      } finally {
        setLoading(false);
      }
    },
    [camera?.id, withFade, adopt]
  );

  const handleStreamFailure = useCallback(
    async (errorCode?: number) => {
      if (camera?.id) {
        setBlacklist((prev) => (prev.includes(camera.id) ? prev : [...prev, camera.id]));
        if (typeof errorCode === "number") reportPlayerError(camera.id, errorCode);
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
    if (cameraMeta?.cameraId === camera.id) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/best-camera?cameraId=${camera.id}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as BestCameraResponse;
        if (!cancelled) setCameraMeta(payload.meta ?? null);
      } catch (err) {
        console.warn("fetch camera meta failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camera?.id, cameraMeta?.cameraId]);

  const activeTimezone = camera?.timezone ?? cameraMeta?.timezone ?? null;
  const now = useNow(1000);
  const location = [camera?.city, camera?.country].filter(Boolean).join(", ");
  const videoId = extractYoutubeId(camera?.sourceUrl ?? camera?.embedUrl);

  // Everything on air, refreshed every few minutes: feeds the headline's
  // "next sunset" and TV mode's queue.
  const [live, setLive] = useState<LiveCamera[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/live-cameras", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { cameras: [] }))
        .then((data: { cameras?: LiveCamera[] }) => {
          if (!cancelled) setLive(data.cameras ?? []);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const phase = now ? describeSunPhase(cameraMeta?.nextEvent, cameraMeta?.followingEvent, now, activeTimezone) : null;
  const nextElsewhere = useMemo(() => {
    if (!now || !phase || phase.tone !== "neutral") return null;
    const golden = goldenNow(live, now).filter((c) => c.id !== camera?.id);
    if (golden.length) return { camera: golden[0], live: true as const };
    const next = upcoming(live, now, "sunset").find((u) => u.camera.id !== camera?.id);
    return next ? { camera: next.camera, live: false as const, event: next.event } : null;
  }, [live, now, phase, camera?.id]);

  // A couple of sentences about the place, so a newcomer knows what they see.
  const [blurb, setBlurb] = useState<{ description: string | null; source: string | null } | null>(null);
  useEffect(() => {
    if (!camera?.id) return;
    let cancelled = false;
    setBlurb(null);
    fetch(`/api/camera-blurb?cameraId=${encodeURIComponent(camera.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setBlurb({ description: data.description ?? null, source: data.source ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [camera?.id]);

  // --- TV mode: sit back, it moves to the next golden hour on its own. ----
  const [tv, setTv] = useState(false);
  useEffect(() => {
    try {
      setTv(window.localStorage.getItem(TV_KEY) === "1");
    } catch {}
  }, []);
  const toggleTv = useCallback(() => {
    setTv((v) => {
      try {
        window.localStorage.setItem(TV_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }, []);
  const tvNext = useCallback(async () => {
    if (!now) return;
    const queue = goldenNow(live, now).filter((c) => c.id !== camera?.id && !seen.slice(-8).includes(c.id));
    if (queue.length) await switchTo(queue[0].id);
    else await handleSwitch();
  }, [now, live, camera?.id, seen, switchTo, handleSwitch]);
  const tvNextRef = useRef(tvNext);
  tvNextRef.current = tvNext;
  useEffect(() => {
    if (!tv) return;
    const id = setInterval(() => {
      tvNextRef.current();
    }, TV_DWELL_MS);
    return () => clearInterval(id);
  }, [tv, camera?.id]);

  // --- Keyboard: → next · T tv mode · F fullscreen · S save ----------------
  const { toggle: toggleFavourite, has: isFavourite } = useFavourites();
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "n") handleSwitch();
      else if (e.key === "t") toggleTv();
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "s" && camera?.id) toggleFavourite(camera.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSwitch, toggleTv, toggleFullscreen, toggleFavourite, camera?.id]);

  const eyebrow = phase && now ? headlineFor(phase, now) : null;
  const eyebrowTone = phase?.tone === "golden" ? "text-amber-300" : phase?.tone === "blue" ? "text-violet-300" : "text-white/50";

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
        style={{ width: "min(100%, calc((100dvh - 23rem) * 16 / 9))" }}
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
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${fading ? "opacity-100" : "opacity-0"}`}
            />
          </div>
          <p className="pointer-events-none absolute left-full top-0 ml-6 hidden w-40 text-[11px] leading-relaxed text-white/35 2xl:block">
            Resolution: the ⚙ in the player&apos;s control bar.
            <br />
            <span className="text-white/25">→ next · T tv · F fullscreen · S save</span>
          </p>
        </div>

        {/* Caption: words on the left; map and controls stacked on the right. */}
        <div className="fs-hide mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_12rem] sm:gap-10">
          <div className="min-w-0">
            {eyebrow ? (
              <p className={`mb-2 text-[11px] font-medium uppercase tracking-[0.22em] ${eyebrowTone}`}>
                {eyebrow}
                {nextElsewhere ? (
                  <>
                    <span className="text-white/25"> · </span>
                    <button onClick={() => switchTo(nextElsewhere.camera.id)} className="normal-case tracking-normal text-white/60 underline-offset-2 hover:text-amber-200 hover:underline">
                      {nextElsewhere.live
                        ? `Golden hour now in ${nextElsewhere.camera.city ?? nextElsewhere.camera.name} →`
                        : `Next sunset: ${nextElsewhere.camera.city ?? nextElsewhere.camera.name} ${now ? formatRelativeShort(nextElsewhere.event.timeISO, now) : ""} →`}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            <h1 className="font-serif text-4xl leading-none tracking-tight text-white sm:text-5xl">
              {camera?.name ?? "No active stream"}
            </h1>
            <p className="mt-2 text-sm text-white/55">
              {location || "Location pending"}
              {camera?.tags?.[0] ? <span className="text-white/35"> · {camera.tags[0]}</span> : null}
            </p>
            {blurb?.description ? (
              <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-relaxed text-white/60">
                {blurb.description}
                {blurb.source ? (
                  <>
                    {" "}
                    <a href={blurb.source} target="_blank" rel="noreferrer noopener" className="whitespace-nowrap text-white/35 underline-offset-2 hover:text-white/70 hover:underline">
                      Wikipedia ↗
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            <Conditions meta={cameraMeta} timezone={activeTimezone} now={now} />
          </div>

          <div className="flex flex-row items-start gap-4 sm:flex-col sm:items-stretch sm:gap-3">
            <MiniMap lat={camera?.lat ?? null} lng={camera?.lng ?? null} name={camera?.name ?? ""} className="h-[5.75rem] w-40 sm:h-28 sm:w-full" />
            <div className="flex flex-1 flex-col gap-2 sm:flex-none">
              <button
                onClick={handleSwitch}
                disabled={loading}
                className="group w-full border border-white/25 px-4 py-2.5 text-sm text-white transition hover:border-amber-200 hover:text-amber-200 disabled:opacity-50"
              >
                {loading ? "Switching…" : "Next camera"}
                <span aria-hidden className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
              </button>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={toggleTv}
                  aria-pressed={tv}
                  title="TV mode: moves to the next golden hour every few minutes (T)"
                  className={`flex-1 border px-2 py-1.5 transition ${tv ? "border-amber-300 bg-amber-300 text-black" : "border-white/20 text-white/70 hover:border-white/50"}`}
                >
                  {tv ? "TV on" : "TV mode"}
                </button>
                <button
                  onClick={() => camera?.id && toggleFavourite(camera.id)}
                  aria-pressed={camera ? isFavourite(camera.id) : false}
                  title="Save this camera (S)"
                  className={`flex-1 border px-2 py-1.5 transition ${camera && isFavourite(camera.id) ? "border-rose-300 text-rose-300" : "border-white/20 text-white/70 hover:border-white/50"}`}
                >
                  {camera && isFavourite(camera.id) ? "♥ Saved" : "♡ Save"}
                </button>
                <button
                  onClick={toggleFullscreen}
                  title="Fullscreen (F)"
                  className="border border-white/20 px-2 py-1.5 text-white/70 transition hover:border-white/50"
                >
                  ⛶
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function formatRelativeShort(iso: string, now: Date): string {
  const min = Math.round((Date.parse(iso) - now.getTime()) / 60_000);
  if (min <= 0) return "now";
  return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
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
