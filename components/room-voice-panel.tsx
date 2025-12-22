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
  variant?: "full" | "compact";
};

export function RoomVoicePanel({ status, variant = "full" }: Props) {
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
      setError("We couldn’t enable audio. Please try again.");
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
      ? "bg-green-200/30 text-green-100"
      : voiceStatus === "joining"
      ? "bg-orange-200/30 text-orange-100"
      : voiceStatus === "error" || status === "error"
      ? "bg-red-200/30 text-red-100"
      : "bg-white/20 text-white/70";

  const label =
    voiceStatus === "joined"
      ? "Joined"
      : voiceStatus === "joining"
      ? "Connecting"
      : voiceStatus === "error" || status === "error"
      ? "Failed"
      : "Not joined";

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${pillClass}`}>
          {label}
        </span>
        {voiceStatus === "joined" ? (
          <button
            onClick={handleLeave}
            className="rounded-full border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-100 transition hover:border-red-300"
          >
            Leave voice
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={!canJoin || voiceStatus === "joining"}
            className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-orange-600/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:from-zinc-600 disabled:to-zinc-600 disabled:shadow-none"
          >
            {voiceStatus === "joining" ? "Connecting…" : "Join voice"}
          </button>
        )}
        {error && (
          <p className="text-xs text-red-200" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-lg shadow-black/30 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-white">Room voice channel</p>
          <p className="text-xs text-white/60">Powered by Cloudflare Realtime Audio</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillClass}`}>
          {label}
        </span>
      </div>

      <p className="text-sm text-white/70">
        Hop on voice to talk without delay. Cameras stay off unless you enable them.
      </p>

      <div className="mt-4 flex gap-3">
        {voiceStatus === "joined" ? (
          <button
            onClick={handleLeave}
            className="flex-1 rounded-full border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-100 transition hover:border-red-300"
          >
            Leave voice
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={!canJoin || voiceStatus === "joining"}
            className="flex-1 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-600/40 transition hover:shadow-xl disabled:cursor-not-allowed disabled:from-zinc-600 disabled:to-zinc-600 disabled:shadow-none"
          >
            {voiceStatus === "joining" ? "Connecting…" : "Join voice"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
