import { config as loadEnv } from "dotenv";
import { listCameras } from "../lib/cameras";
import { refreshCamera } from "../lib/cameraRefresh";

loadEnv({ path: ".env.local" });
const BATCH_SIZE = 200;

async function main() {
  const summary = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    details: [] as Array<{ id: string; updated: boolean; reason?: string }>,
  };

  let offset = 0;
  while (true) {
    const batch = await listCameras(BATCH_SIZE, offset);
    if (!batch.length) {
      break;
    }
    offset += batch.length;

    for (const camera of batch) {
      if (camera.linkAvailable !== false) {
        continue;
      }
      summary.checked++;
      try {
        const result = await refreshCamera(camera);
        summary.details.push({
          id: camera.id,
          updated: result.updated,
          reason: (result as { reason?: string }).reason,
        });
        if (result.updated) {
          summary.refreshed++;
        } else {
          summary.failed++;
        }
      } catch (error) {
        summary.details.push({
          id: camera.id,
          updated: false,
          reason: error instanceof Error ? error.message : "unknown-error",
        });
        summary.failed++;
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
