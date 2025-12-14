import { fetchAvailableRankings } from "../lib/rankings";
import { getCameraTagsMap } from "../lib/cameras";
import { assignToPool } from "../lib/camera-pools";
import type { CameraEvaluation } from "../lib/client-ranking";
import { createWriteStream } from "fs";

async function exportTrainingData() {
  console.log("Starting training data export...");

  // 获取所有ranking数据
  const rankingResult = await fetchAvailableRankings({
    limit: 1000,
    freshnessMinutes: 24 * 60,
  });

  console.log(`Fetched ${rankingResult.rows.length} camera rankings`);

  const cameraIds = rankingResult.rows.map((row) => row.camera_id);
  const cameraTagsMap = await getCameraTagsMap(cameraIds);

  const csvStream = createWriteStream("training_data_initial.csv");
  csvStream.write(
    "camera_id,score,label,weather_class,is_daytime,tags,pool_id,source,timestamp\n"
  );

  let count = 0;
  for (const row of rankingResult.rows) {
    const evaluation: CameraEvaluation = {
      score: row.score,
      label: row.label as CameraEvaluation["label"],
      isClear: row.is_clear ?? false,
      isDaytime: null,
      weatherClass: row.weather_class as CameraEvaluation["weatherClass"],
      distanceMinutes: row.distance_minutes ?? undefined,
    };

    const tags = cameraTagsMap.get(row.camera_id);
    const poolId = assignToPool(evaluation, tags);

    const tagsStr = tags?.join("|") || "";
    // isDaytime is not stored in rankings table, leave it empty
    csvStream.write(
      `${row.camera_id},${row.score},${row.label},${row.weather_class},,"${tagsStr}",${poolId},rule,${new Date().toISOString()}\n`
    );
    count++;
  }

  csvStream.end();

  console.log(`Training data exported to training_data_initial.csv`);
  console.log(`Total samples: ${count}`);

  // Print pool distribution
  const poolCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rankingResult.rows) {
    const evaluation: CameraEvaluation = {
      score: row.score,
      label: row.label as CameraEvaluation["label"],
      isClear: row.is_clear ?? false,
      isDaytime: null,
      weatherClass: row.weather_class as CameraEvaluation["weatherClass"],
      distanceMinutes: row.distance_minutes ?? undefined,
    };
    const tags = cameraTagsMap.get(row.camera_id);
    const poolId = assignToPool(evaluation, tags);
    poolCounts[poolId]++;
  }

  console.log("\nPool distribution:");
  for (let i = 1; i <= 5; i++) {
    console.log(`Pool ${i}: ${poolCounts[i]} cameras`);
  }
}

exportTrainingData().catch((error) => {
  console.error("Error exporting training data:", error);
  process.exit(1);
});
