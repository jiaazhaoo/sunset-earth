import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ShareRoomLink } from "@/components/share-room-link";
import { RealtimeSidebar } from "@/components/realtime-sidebar";
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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-orange-200">
                Live Room
              </div>
              <h1 className="text-4xl font-semibold text-white">
                Watch the sunset together
              </h1>
              <p className="text-base text-white/70">
                Stream is synced for everyone in this room. Send the link below to invite more friends on board.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 shadow-inner shadow-black/20">
              <dl className="grid gap-5 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Room ID
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {room.room_id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Camera
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {camera?.name ?? cameraId ?? "Pending"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Started
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {formattedStartTime}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-white/5 bg-transparent p-1">
              <ShareRoomLink shareUrl={shareUrl} />
            </div>
          </div>
        </header>

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl shadow-black/40">
              {camera?.embedUrl ? (
                <iframe
                  key={camera.embedUrl}
                  src={camera.embedUrl}
                  title={camera.name}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="aspect-video h-full w-full"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-white/60">
                  Stream unavailable
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-200">
                    Room insights
                  </p>
                  <h2 className="text-2xl font-semibold text-white">Stay in sync</h2>
                </div>
                <span className="rounded-full border border-white/20 px-4 py-1 text-xs uppercase tracking-[0.35em] text-white/70">
                  Beta
                </span>
              </div>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <dt className="text-xs uppercase tracking-[0.35em] text-white/60">
                    Timezone
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {room.room_timezone ?? "Not specified"}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <dt className="text-xs uppercase tracking-[0.35em] text-white/60">
                    Room type
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {room.room_type === "public" ? "Public session" : "Private invite"}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-white/70">
                Need better audio or presence syncing? The panel on the right now bundles realtime chat, voice, and participant lists powered by Cloudflare Realtime.
              </p>
            </div>
          </div>

          <RealtimeSidebar roomId={room.room_id} />
        </section>
      </main>
    </div>
  );
}
