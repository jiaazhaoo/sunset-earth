'use client';

import { useEffect, useState } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
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
          setError("连接 Cloudflare Realtime 失败，请刷新页面再试");
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
          setError("加入实时会议失败，请刷新页面再试");
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
      <SidebarContent status={status} error={error} />
    </RealtimeKitProvider>
  );
}

function SidebarContent({
  status,
  error,
}: {
  status: MeetingConnectionStatus;
  error: string | null;
}) {
  const { meeting } = useRealtimeKitMeeting();

  if (status === "error" || error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        {error ?? "连接实时会议失败"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RoomVoicePanel status={status} />
      {meeting && status === "connected" ? (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-0 shadow-sm">
            <div className="h-[420px] min-h-[420px]">
              <RtkChat
                meeting={meeting}
                style={{
                  "--rtk-color-background-base": "#ffffff",
                  "--rtk-color-background-elevated": "#f8f9fb",
                  "--rtk-color-border": "#e4e4e7",
                  "--rtk-color-text-primary": "#0f172a",
                  "--rtk-color-text-secondary": "#475569",
                  "--rtk-color-surface": "#ffffff",
                  "--rtk-color-muted": "#f4f4f5",
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
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          正在连接实时会议...
        </div>
      )}
    </div>
  );
}
