'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import {
  RtkChatComposerView,
  RtkChatMessagesUiPaginated,
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
  children: ReactNode;
};

type RealtimeShellContextValue = {
  status: MeetingConnectionStatus;
  error: string | null;
  roomId: string;
};

const RealtimeShellContext = createContext<RealtimeShellContextValue | null>(
  null
);

function useRealtimeShell() {
  const context = useContext(RealtimeShellContext);
  if (!context) {
    throw new Error("RoomRealtimeProvider is missing.");
  }
  return context;
}

export function RoomRealtimeProvider({ roomId, children }: Props) {
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
      <RealtimeShellContext.Provider value={{ status, error, roomId }}>
        {children}
      </RealtimeShellContext.Provider>
    </RealtimeKitProvider>
  );
}

type ParticipantInfo = {
  id: string;
  name: string;
  picture?: string;
};

export function RoomMembersCard({
  variant = "card",
  shareUrl,
}: {
  variant?: "card" | "flat";
  shareUrl?: string;
}) {
  const { status, error, roomId } = useRealtimeShell();
  const { meeting } = useRealtimeKitMeeting();
  const [copied, setCopied] = useState(false);
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
    isReady: Boolean(meeting && status === "connected"),
    count: participantsWithSelf.length,
  });

  const containerClass =
    variant === "card"
      ? "rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur"
      : "p-0";

  const showBadge = variant === "card";
  const isCompact = variant === "flat";

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Room members</p>
          <p className="text-xs text-white/55">
            {meeting && status === "connected"
              ? `${participantsWithSelf.length || 0} active now`
              : "Connecting to presence..."}
          </p>
        </div>
        {showBadge && (
          <span className="rounded-full border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.35em] text-white/55">
            Live
          </span>
        )}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-200">{error}</p>
      ) : (
        <div className={isCompact ? "mt-2 flex flex-wrap items-center gap-3" : "mt-3 flex flex-wrap gap-3"}>
          {!meeting || status !== "connected" ? (
            <p className="text-sm text-white/65">Waiting for guests to join…</p>
          ) : participantsWithSelf.length === 0 ? (
            <p className="text-sm text-white/65">
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
              {shareUrl && (
                <button
                  type="button"
                  onClick={handleCopy}
                  title={copied ? "Copied" : "Copy link"}
                  aria-label={copied ? "Copied" : "Copy link"}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-lg shadow-orange-500/30 transition hover:shadow-xl"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      )}
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

export function LiveChatCard() {
  const { status, error, roomId } = useRealtimeShell();
  const { meeting } = useRealtimeKitMeeting();

  if (status === "error" || error) {
    return (
      <div className="rounded-3xl border border-red-400/40 bg-red-500/10 p-6 text-sm text-red-100 shadow-xl shadow-black/30">
        {error ?? "We couldn’t join the realtime meeting."}
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,197,143,0.12),_rgba(15,16,22,0.92)_55%)] shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-orange-200">
            Live chat
          </p>
          <p className="text-base font-semibold text-white">Talk with friends</p>
        </div>
        <RoomVoicePanel status={status} variant="compact" />
      </div>
      {meeting && status === "connected" ? (
        <>
          <div className="flex flex-1 min-h-0 flex-col px-4 py-4">
            <RtkChatMessagesUiPaginated
              meeting={meeting}
              className="flex-1 min-h-0"
            />
          </div>
          <div className="border-t border-white/10 px-4 pb-4 pt-3">
            <RtkChatComposerView
              storageKey={`room-${roomId}-chat`}
              inputTextPlaceholder="Message..."
              canSendTextMessage={Boolean(
                meeting.self?.permissions?.chatPublic?.canSend &&
                  meeting.self?.permissions?.chatPublic?.text
              )}
              canSendFiles={Boolean(
                meeting.self?.permissions?.chatPublic?.canSend &&
                  meeting.self?.permissions?.chatPublic?.files
              )}
              maxLength={meeting.chat?.maxTextLimit ?? 1000}
              rateLimits={
                meeting.chat?.rateLimits ?? { period: 0, maxInvocations: 0 }
              }
              onNewMessage={(event) => {
                meeting.chat?.sendMessage(event.detail, []);
              }}
            />
          </div>
          <div className="sr-only">
            <RtkParticipantsAudio meeting={meeting} />
            <RtkNotifications meeting={meeting} />
            <RtkDialogManager meeting={meeting} />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center border-t border-white/10 px-5 py-6 text-sm text-white/70">
          Connecting to realtime meeting...
        </div>
      )}
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
