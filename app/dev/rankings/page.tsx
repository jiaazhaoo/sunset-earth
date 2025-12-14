import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listCameras } from "@/lib/cameras";

type RankingRow = {
  camera_id: string;
  score: number | null;
  label: string | null;
  distance_minutes: number | null;
  available: boolean | null;
};

async function getRankings() {
  const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from("camera_rankings")
    .select("camera_id,score,label,distance_minutes,available")
    .gte("computed_at", freshnessThreshold.toISOString())
    .order("score", { ascending: false })
    .order("distance_minutes", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RankingRow[];
}

export default async function DevRankingsPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const [rankings, cameras] = await Promise.all([
    getRankings(),
    listCameras(500),
  ]);

  const cameraMap = new Map(cameras.map((camera) => [camera.id, camera]));

  const visibleRankings = rankings.filter((row) => {
    if (!row.available) return false;
    const camera = cameraMap.get(row.camera_id);
    return camera && camera.linkAvailable !== false;
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-orange-500">
          Dev Only
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Current Ranked Cameras
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Ordered exactly as the web client would consume them
        </p>
      </header>

      <ol className="space-y-4">
        {visibleRankings.map((row, index) => {
          const camera = cameraMap.get(row.camera_id);
          if (!camera) return null;
          return (
            <li
              key={row.camera_id}
              className="flex items-start justify-between rounded-xl border border-zinc-200/60 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400">
                  #{index + 1}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {camera.name}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {[camera.city, camera.country].filter(Boolean).join(" · ")}
                </p>
                {row.label && (
                  <p className="mt-1 text-xs uppercase tracking-[0.4em] text-orange-500">
                    {row.label}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-500">
                  {row.score ?? 0}
                </p>
                <p className="text-xs text-zinc-400">
                  distance {row.distance_minutes ?? "-"} min
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {!visibleRankings.length && (
        <p className="text-center text-sm text-zinc-500">
          No ranked cameras available. Run compute-rankings first.
        </p>
      )}
    </div>
  );
}
