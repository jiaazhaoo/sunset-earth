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

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-500">
            Room
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            一起看日落
          </h1>
          <p className="text-sm text-zinc-500">
            房间 ID：{room.room_id} · 摄像头 {camera?.name ?? cameraId}
          </p>
          <ShareRoomLink shareUrl={shareUrl} />
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-4">
            <div className="aspect-video overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-sm">
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
                  找不到摄像头
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                即将上线的功能
              </h2>
              <ul className="mt-3 list-disc pl-5 text-sm text-zinc-600">
                <li>房间聊天（Supabase Realtime）</li>
                <li>Presence 在线人数同步</li>
                <li>语音房间体验优化</li>
              </ul>
            </div>
          </div>

          <RealtimeSidebar roomId={room.room_id} />
        </section>
      </main>
    </div>
  );
}
