import { CameraViewer } from "@/components/camera-viewer";
import { getRandomCamera } from "@/lib/cameras";

export default async function Home() {
  const initialCamera = await getRandomCamera();

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-12 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-500">
            Sunset Earth
          </p>
          <h1 className="text-4xl font-semibold text-zinc-900">
            全球实时日落 · 现在就看
          </h1>
          <p className="text-base text-zinc-600">
            我们从世界各地挑选最佳的 YouTube 摄像头，随时看到正在发生的日落风景。
            点击切换即可秒换下一个摄像头。
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/all-cameras"
              className="inline-flex items-center rounded-full border border-orange-200 px-4 py-2 text-sm font-medium text-orange-600 transition hover:border-orange-500 hover:text-orange-800"
            >
              查看全部摄像头
            </a>
          </div>
        </header>

        <CameraViewer initialCamera={initialCamera} />
      </main>
    </div>
  );
}
