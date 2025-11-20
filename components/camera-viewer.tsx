'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type { CameraRecord } from "@/lib/cameras";

type Props = {
  initialCamera: CameraRecord | null;
};

const STORAGE_KEY = "sunset-earth-seen";
const UNAVAILABLE_KEY = "sunset-earth-unavailable";
const REFRESH_KEY = "sunset-earth-refresh-attempts";
const REFRESH_COOLDOWN = 3 * 60 * 60 * 1000;

type BestCameraResponse = {
  camera: CameraRecord;
  rotationReset?: boolean;
};

type RefreshResponse = {
  camera?: CameraRecord;
  updated?: boolean;
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
          if (text.includes("This live stream recording is not available")) {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [refreshAttempts, setRefreshAttempts] = useState<Record<string, number>>({});
  const failureHandlerRef = useRef<() => void>(() => undefined);

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
      const stored = window.localStorage.getItem(REFRESH_KEY);
      if (stored) {
        setRefreshAttempts(JSON.parse(stored));
      }
    } catch {
      setRefreshAttempts({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REFRESH_KEY, JSON.stringify(refreshAttempts));
  }, [refreshAttempts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        setSeen(parsed);
      }
    } catch {
      setSeen([]);
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

  const excludeQuery = useMemo(() => {
    const ids = [...new Set([...seen, ...blacklist])];
    if (!ids.length) return "";
    const params = new URLSearchParams();
    params.set("exclude", ids.join(","));
    return `?${params.toString()}`;
  }, [seen, blacklist]);

  const handleSwitch = async () => {
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
    } catch {
      setError("切换摄像头失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  };

  const attemptRefresh = async (cam: CameraRecord | null) => {
    if (!cam?.id) {
      return false;
    }
    const now = Date.now();
    const last = refreshAttempts[cam.id];
    if (last && now - last < REFRESH_COOLDOWN) {
      return false;
    }
    setRefreshAttempts((prev) => ({ ...prev, [cam.id]: now }));
    try {
      const response = await fetch("/api/refresh-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cameraId: cam.id }),
      });
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as RefreshResponse;
      if (payload.camera) {
        setCamera(payload.camera);
        setBlacklist((prev) => prev.filter((id) => id !== cam.id));
        if (cam.id) {
          updateAvailability(cam.id, true).catch(() => undefined);
        }
        return true;
      }
    } catch (err) {
      console.warn("refresh camera failed", err);
    }
    return false;
  };

  const handleStreamFailure = async () => {
    if (!camera) {
      handleSwitch().catch(() => undefined);
      return;
    }
    const recovered = await attemptRefresh(camera);
    if (recovered) {
      return;
    }
    if (camera.id) {
      setBlacklist((prev) =>
        prev.includes(camera.id) ? prev : [...prev, camera.id]
      );
      updateAvailability(camera.id, false).catch(() => undefined);
    }
    handleSwitch().catch(() => undefined);
  };

  failureHandlerRef.current = handleStreamFailure;

  useEffect(() => {
    if (!camera?.embedUrl) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/check-camera", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            camera: {
              embedUrl: camera.embedUrl,
              sourceUrl: camera.sourceUrl,
            },
          }),
        });
        if (!response.ok) {
          return;
        }
        const { available } = (await response.json()) as { available: boolean };
        if (!available && !cancelled) {
          failureHandlerRef.current();
        }
      } catch (err) {
        console.warn("camera availability probe failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camera?.embedUrl, camera?.sourceUrl, camera?.id]);

  return (
    <section className="flex w-full flex-col gap-8">
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-sm">
        {camera?.embedUrl ? (
          <VideoFrame camera={camera} onStreamError={handleStreamFailure} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-200">
            暂无可播放的摄像头
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
            当前摄像头
          </p>
          <h2 className="text-2xl font-semibold text-zinc-900">
            {camera?.name ?? "暂无"}
          </h2>
          <p className="text-sm text-zinc-500">
            {[camera?.city, camera?.country].filter(Boolean).join(" · ") ||
              "等待加载位置..."}
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <CameraActions
          cameraId={camera?.id ?? null}
          loading={loading}
          onSwitchClick={handleSwitch}
        />
      </div>
    </section>
  );
}

function CameraActions({
  cameraId,
  loading,
  onSwitchClick,
}: {
  cameraId: string | null;
  loading: boolean;
  onSwitchClick: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    if (!cameraId) {
      setError("当前没有可用摄像头");
      return;
    }

    setCreating(true);
    setError(null);
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
      setError("创建房间失败，请稍后再试");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        onClick={onSwitchClick}
        disabled={loading}
        className="flex-1 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {loading ? "切换中…" : "切换摄像头"}
      </button>
      <button
        onClick={handleCreateRoom}
        disabled={!cameraId || creating}
        className="flex flex-1 items-center justify-center rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-800 hover:border-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400"
      >
        {creating ? "创建房间中…" : "邀请朋友一起看"}
      </button>
      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
async function updateAvailability(cameraId: string, available: boolean) {
  try {
    await fetch("/api/camera-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraId, available }),
    });
  } catch (error) {
    console.warn("update availability failed", error);
  }
}
