import { CameraViewer } from "@/components/camera-viewer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCameraById, getRandomCamera } from "@/lib/cameras";
import type { CameraRecord } from "@/lib/cameras";

async function getBestCamera(): Promise<CameraRecord | null> {
  try {
    // Query pre-computed rankings for the best camera
    const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data: rankings, error } = await supabaseAdmin
      .from("camera_rankings")
      .select("camera_id")
      .eq("available", true)
      .gte("computed_at", freshnessThreshold.toISOString())
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !rankings) {
      console.warn("[getBestCamera] No rankings found, falling back to random");
      return await getRandomCamera();
    }

    const camera = await getCameraById(rankings.camera_id);
    return camera || await getRandomCamera();
  } catch (error) {
    console.error("[getBestCamera] Error:", error);
    return await getRandomCamera();
  }
}

export default async function Home() {
  // Get the best camera from pre-computed rankings
  const initialCamera = await getBestCamera();

  return (
    <div className="flex min-h-screen items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-zinc-800/80 px-4 py-1.5 shadow-sm backdrop-blur-sm">
            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400"></div>
            <span className="text-xs font-medium uppercase tracking-[0.25em] text-orange-400">
              Live
            </span>
          </div>

          <h1 className="text-4xl font-bold leading-tight text-zinc-50 sm:text-5xl">
            全球实时日落·<span className="bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">现在就看</span>
          </h1>

          <p className="max-w-2xl text-base text-zinc-400">
            我们从世界各地挑选最佳的摄像头，让你随时欣赏正在发生的日落美景
          </p>
        </header>

        <CameraViewer initialCamera={initialCamera} />
      </main>
    </div>
  );
}
