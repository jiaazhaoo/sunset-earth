'use client';

import { useState } from "react";
import type { CameraRecord } from "@/lib/cameras";

type Props = {
  initialCamera: CameraRecord | null;
};

export function CameraViewer({ initialCamera }: Props) {
  const [camera, setCamera] = useState<CameraRecord | null>(initialCamera);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSwitch = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/best-camera", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Request failed");
      }

      const payload = (await response.json()) as { camera: CameraRecord };
      setCamera(payload.camera);
    } catch {
      setError("切换摄像头失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex w-full flex-col gap-8">
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-sm">
        {camera?.embedUrl ? (
          <iframe
            key={camera.embedUrl}
            src={camera.embedUrl}
            title={camera.name}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            className="h-full w-full"
          />
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
