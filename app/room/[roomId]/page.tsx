import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  LiveChatCard,
  RoomMembersCard,
  RoomRealtimeProvider,
} from "@/components/realtime-sidebar";
import { getRoom } from "@/lib/rooms";
import { getCameraById } from "@/lib/cameras";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ camera?: string }>;
};

export default async function RoomPage({
  params,
  searchParams,
}: RoomPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const room = await getRoom(resolvedParams.roomId);
  if (!room) {
    notFound();
  }
  if (room.is_close) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-6 text-zinc-50">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 px-10 py-12 text-center shadow-2xl shadow-black/50 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-300">
            Room Closed
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-white">
            Sunset session has ended
          </h1>
          <p className="mt-3 text-base text-white/70">
            This shared room is no longer active. Head back to the homepage and spin up a fresh watch party any time.
          </p>
        </div>
      </div>
    );
  }

  const cameraId = resolvedSearchParams.camera ?? room.camera_id;
  const camera = cameraId ? await getCameraById(cameraId) : null;
  const headersList = await headers();
  const protocol =
    headersList.get("x-forwarded-proto") ??
    headersList.get("protocol") ??
    "http";
  const host =
    headersList.get("x-forwarded-host") ??
    headersList.get("host") ??
    "localhost:3000";
  const shareUrl = `${protocol}://${host}/room/${room.room_id}?camera=${cameraId ?? ""}`;

  const formattedStartTime = room.room_start_time
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(room.room_start_time))
    : "Waiting to begin";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-950 text-zinc-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 right-[-6rem] h-72 w-72 rounded-full bg-orange-500/20 blur-[140px]" />
        <div className="absolute bottom-[-8rem] left-[-4rem] h-96 w-96 rounded-full bg-amber-500/15 blur-[160px]" />
        <div className="absolute left-1/2 top-20 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-10">
        <RoomRealtimeProvider roomId={room.room_id}>
          <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_auto]">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 via-white/4 to-transparent p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur lg:col-start-1 lg:row-start-1">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.4em] text-orange-200/90">
                <span className="rounded-full border border-orange-200/30 bg-orange-400/5 px-3 py-1">
                  Live Room
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/60">
                  Synced stream
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-[40px]">
                Sunset watch party
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
                Stream stays locked for everyone in this room. Share the invite, settle in, and watch the glow roll in together.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/70">
                <span className="text-white/45">Now playing</span>
                <span className="font-semibold text-white">
                  {camera?.name ?? cameraId ?? "Pending"}
                </span>
                <span className="text-white/40">•</span>
                <span className="text-white/45">Room started</span>
                <span className="font-semibold text-white">
                  {formattedStartTime}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/50 shadow-2xl shadow-black/40 lg:col-start-1 lg:row-start-2">
              {camera?.embedUrl ? (
                <iframe
                  key={camera.embedUrl}
                  src={camera.embedUrl}
                  title={camera.name}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="aspect-video w-full"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-white/60">
                  Stream unavailable
                </div>
              )}
            </div>

            <div className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/30 backdrop-blur lg:col-start-2 lg:row-start-1">
              <RoomMembersCard variant="flat" shareUrl={shareUrl} />
            </div>

            <div className="lg:col-start-2 lg:row-start-2">
              <LiveChatCard />
            </div>
          </section>
        </RoomRealtimeProvider>
      </main>
    </div>
  );
}
