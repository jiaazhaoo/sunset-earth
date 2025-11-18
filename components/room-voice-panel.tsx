'use client';

import { useState } from "react";
import { useRealtimeKitMeeting } from "@cloudflare/realtimekit-react";

export type MeetingConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

type VoiceState = "idle" | "joining" | "joined" | "error";

type Props = {
  status: MeetingConnectionStatus;
};

export function RoomVoicePanel({ status }: Props) {
  const { meeting } = useRealtimeKitMeeting();
  const [voiceStatus, setVoiceStatus] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const canJoin = status === "connected" && !!meeting;

  async function handleJoin() {
    if (!meeting || !canJoin) {
      return;
    }
    setVoiceStatus("joining");
    setError(null);
    try {
      await meeting.self.enableAudio();
      setVoiceStatus("joined");
    } catch (err) {
      console.error("enable audio error", err);
      setVoiceStatus("error");
      setError("开启语音失败，请稍后再试");
    }
  }

  async function handleLeave() {
    if (!meeting) {
      return;
    }
    try {
      await meeting.self.disableAudio?.();
      const audioPublication = (meeting.self as {
        rawAudioTrack?: MediaStreamTrack;
        audioTrack?: { track?: MediaStreamTrack; mediaStreamTrack?: MediaStreamTrack };
      });
      const rawTrack =
        audioPublication.rawAudioTrack ??
        audioPublication.audioTrack?.track ??
        audioPublication.audioTrack?.mediaStreamTrack;
      if (rawTrack && rawTrack.readyState !== "ended") {
        try {
          rawTrack.stop();
        } catch (err) {
          console.warn("Failed to stop audio track", err);
        }
      }
    } catch (err) {
      console.warn("disable audio error", err);
    } finally {
      setVoiceStatus("idle");
      setError(null);
    }
  }

  const pillClass =
    voiceStatus === "joined"
      ? "bg-green-100 text-green-700"
      : voiceStatus === "joining"
      ? "bg-amber-100 text-amber-700"
      : voiceStatus === "error" || status === "error"
      ? "bg-red-100 text-red-600"
      : "bg-zinc-100 text-zinc-500";

  const label =
    voiceStatus === "joined"
      ? "已加入"
      : voiceStatus === "joining"
      ? "连接中"
      : voiceStatus === "error" || status === "error"
      ? "失败"
      : "未加入";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-zinc-900">语音房间</p>
          <p className="text-xs text-zinc-500">
            使用 Cloudflare Realtime 进行语音对话
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillClass}`}>
          {label}
        </span>
      </div>

      <p className="text-sm text-zinc-600">
        加入后即可和房间中的朋友实时语音聊天，默认不启用摄像头。
      </p>

      <div className="mt-4 flex gap-3">
        {voiceStatus === "joined" ? (
          <button
            onClick={handleLeave}
            className="flex-1 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:border-red-500"
          >
            退出语音
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={!canJoin || voiceStatus === "joining"}
            className="flex-1 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
          >
            {voiceStatus === "joining" ? "连接中…" : "加入语音"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
