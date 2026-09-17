import Link from "next/link";
import { listCameras } from "@/lib/cameras";

export const dynamic = "force-dynamic";

async function fetchAllCameras(batchSize = 200) {
  const cameras: Awaited<ReturnType<typeof listCameras>> = [];
  let offset = 0;

  while (true) {
    const batch = await listCameras(batchSize, offset);
    if (!batch.length) {
      break;
    }

    cameras.push(...batch);
    offset += batch.length;
  }

  return cameras;
}

export default async function AllCamerasPage() {
  const cameras = await fetchAllCameras();

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-500">
                Sunset Earth
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                全部摄像头预览
              </h1>
              <p className="text-sm text-zinc-500">
                用于调试/巡检。以下展示当前数据库中的所有摄像头 iframe，方便快速查看播放情况。
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-900"
            >
              返回主页
            </Link>
          </div>
          <p className="text-xs text-zinc-400">
            共 {cameras.length} 个摄像头。若 iframe 显示错误或“Playback disabled”，可以直接定位并处理。
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {cameras.map((camera) => (
            <article
              key={camera.id}
              className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
            >
              <div className="relative aspect-video overflow-hidden rounded-t-2xl bg-black">
                {camera.embedUrl ? (
                  <iframe
                    src={camera.embedUrl}
                    title={camera.name}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                    无链接
                  </div>
                )}
                {!camera.linkAvailable && (
                  <span className="absolute left-3 top-3 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white">
                    已禁用
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 px-4 py-3 text-sm text-zinc-700">
                <p className="text-base font-semibold text-zinc-900">
                  {camera.name}
                </p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {camera.city || camera.country
                    ? [camera.city, camera.country].filter(Boolean).join(" · ")
                    : "未知位置"}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {camera.sourceUrl}
                </p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
