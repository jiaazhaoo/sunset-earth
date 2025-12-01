'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import {
  RtkChat,
  RtkParticipantsAudio,
  RtkNotifications,
  RtkDialogManager,
} from "@cloudflare/realtimekit-react-ui";
import {
  MeetingConnectionStatus,
  RoomVoicePanel,
} from "@/components/room-voice-panel";

type Props = {
  roomId: string;
};

export function RealtimeSidebar({ roomId }: Props) {
  return <RealtimeProviderShell roomId={roomId} />;
}

function RealtimeProviderShell({ roomId }: Props) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const [status, setStatus] =
    useState<MeetingConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapMeeting() {
      setStatus("connecting");
      setError(null);
      try {
        const response = await fetch("/api/realtime-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch realtime token");
        }

        const { token } = (await response.json()) as { token: string };

        if (cancelled) {
          return;
        }

        initMeeting({
          authToken: token,
          defaults: {
            audio: false,
            video: false,
          },
        });
      } catch (err) {
        console.error("Realtime token error:", err);
        if (!cancelled) {
          setError("Connecting to Cloudflare Realtime failed. Please refresh and try again.");
          setStatus("error");
        }
      }
    }

    bootstrapMeeting();

    return () => {
      cancelled = true;
    };
  }, [roomId, initMeeting]);

  useEffect(() => {
    if (!meeting) {
      return;
    }

    let disposed = false;

    async function joinMeeting() {
      try {
        await meeting.join();
        if (!disposed) {
          setStatus("connected");
        }
      } catch (err) {
        console.error("Realtime meeting join error:", err);
        if (!disposed) {
          setError("We couldn’t join the realtime meeting. Refresh and try again.");
          setStatus("error");
        }
      }
    }

    joinMeeting();

    return () => {
      disposed = true;
      meeting.leave().catch(() => undefined);
    };
  }, [meeting]);

  return (
    <RealtimeKitProvider value={meeting}>
      <SidebarContent status={status} error={error} roomId={roomId} />
    </RealtimeKitProvider>
  );
}

function SidebarContent({
  status,
  error,
  roomId,
}: {
  status: MeetingConnectionStatus;
  error: string | null;
  roomId: string;
}) {
  const { meeting } = useRealtimeKitMeeting();

  if (status === "error" || error) {
    return (
      <div className="rounded-3xl border border-red-400/40 bg-red-500/10 p-6 text-sm text-red-100">
        {error ?? "We couldn’t join the realtime meeting."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <RoomVoicePanel status={status} />
      <ParticipantsPanel
        isReady={Boolean(meeting && status === "connected")}
        roomId={roomId}
      />
      {meeting && status === "connected" ? (
        <>
          <div className="rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-200">
                  Live chat
                </p>
                <p className="text-lg font-semibold text-white">Talk with friends</p>
              </div>
            </div>
            <div className="h-[420px] min-h-[420px]">
              <RtkChat
                meeting={meeting}
                style={{
                  "--rtk-color-background-base": "rgba(15,23,42,0.85)",
                  "--rtk-color-background-elevated": "rgba(15,23,42,0.7)",
                  "--rtk-color-border": "rgba(255,255,255,0.1)",
                  "--rtk-color-text-primary": "#f8fafc",
                  "--rtk-color-text-secondary": "#cbd5f5",
                  "--rtk-color-surface": "rgba(15,23,42,0.8)",
                  "--rtk-color-muted": "rgba(148,163,184,0.25)",
                  "--rtk-border-radius": "18px",
                }}
              />
            </div>
          </div>
          <div className="sr-only">
            <RtkParticipantsAudio meeting={meeting} />
            <RtkNotifications meeting={meeting} />
            <RtkDialogManager meeting={meeting} />
          </div>
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/70">
          Connecting to realtime meeting...
        </div>
      )}
    </div>
  );
}

type ParticipantInfo = {
  id: string;
  name: string;
  picture?: string;
};

function ParticipantsPanel({
  isReady,
  roomId,
}: {
  isReady: boolean;
  roomId: string;
}) {
  const { meeting } = useRealtimeKitMeeting();
  const participants = useRealtimeKitSelector<ParticipantInfo[]>((client) => {
    if (!client || !client.participants) {
      return [];
    }
    const joined =
      client.participants.joined?.toArray?.().map((participant) => ({
        id:
          participant.customParticipantId ??
          participant.id ??
          participant.userId,
        name: participant.name || "Sunset Guest",
        picture: participant.picture,
      })) ?? [];
    if (joined.length > 0) {
      return joined;
    }
    const list = client.participants.all?.toArray?.() ?? [];
    return list.map((participant) => ({
      id: participant.customParticipantId ?? participant.userId,
      name: participant.name || "Sunset Guest",
      picture: participant.picture,
    }));
  });

  const participantsWithSelf = useMemo(() => {
    if (!meeting?.self) {
      return participants;
    }
    const selfId =
      meeting.self.customParticipantId ??
      (meeting.self as { userId?: string }).userId ??
      "self";
    if (participants.some((p) => p.id === selfId)) {
      return participants;
    }
    return [
      {
        id: selfId,
        name: meeting.self.name || "You",
        picture: (meeting.self as { picture?: string }).picture,
      },
      ...participants,
    ];
  }, [meeting?.self, participants]);

  const avatars = useMemo(
    () => participantsWithSelf.slice(0, 6),
    [participantsWithSelf]
  );
  const remaining = participantsWithSelf.length - avatars.length;

  usePresenceReporter({
    roomId,
    isReady,
    count: participantsWithSelf.length,
  });

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Room members</p>
          <p className="text-xs text-white/60">
            {isReady
              ? `${participantsWithSelf.length || 0} active now`
              : "Connecting to presence..."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {!isReady ? (
          <p className="text-sm text-white/70">Waiting for guests to join…</p>
        ) : participantsWithSelf.length === 0 ? (
          <p className="text-sm text-white/70">
            It’s just you for now. Share the link to invite friends!
          </p>
        ) : (
          <>
            {avatars.map((participant) => (
              <ParticipantAvatar key={participant.id} participant={participant} />
            ))}
            {remaining > 0 && (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-white/30 text-xs text-white/70">
                +{remaining}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ParticipantAvatar({ participant }: { participant: ParticipantInfo }) {
  const initials = useMemo(
    () =>
      participant.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "U",
    [participant.name]
  );

  if (participant.picture) {
    return (
      <div
        className="h-10 w-10 rounded-full border border-white/20 bg-cover bg-center"
        style={{ backgroundImage: `url(${participant.picture})` }}
        title={participant.name}
        aria-label={participant.name}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
      {initials}
    </div>
  );
}

function usePresenceReporter({
  roomId,
  isReady,
  count,
}: {
  roomId: string;
  isReady: boolean;
  count: number;
}) {
  const lastReported = useRef<number | null>(null);

  useEffect(() => {
    const nextCount = isReady ? count : 0;
    if (!roomId) {
      return;
    }
    if (lastReported.current === nextCount) {
      return;
    }
    lastReported.current = nextCount;

    const controller = new AbortController();
    fetch("/api/room-presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, count: nextCount }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => undefined);

    return () => controller.abort();
  }, [roomId, isReady, count]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const handleUnload = () => {
      try {
        navigator.sendBeacon(
          "/api/room-presence",
          JSON.stringify({ roomId, count: 0 })
        );
      } catch {
        // ignore
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        handleUnload();
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [roomId]);
}
