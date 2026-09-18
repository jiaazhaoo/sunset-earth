import type { CameraRecord } from "@/lib/cameras";
import {
  isCameraAvailable,
  type AvailabilityReason,
  type AvailabilityResult,
} from "@/lib/availability";
import { execute, nowIso } from "@/lib/db";

/**
 * The one place that turns a YouTube probe into a change of
 * `camera_ytb.link_available`. Both cron sweeps and viewer reports go through
 * here so the demotion policy is identical everywhere.
 *
 * Policy: YouTube's own verdicts (UNPLAYABLE/ERROR status, embedding disabled,
 * 404) demote immediately — they matched a workstation ground-truth probe of
 * all 156 links exactly. Anything else (timeouts, bot-check pages, unparsable
 * HTML) is a soft strike; two in a row demote. A successful probe clears the
 * strikes and restores the camera.
 */
export const DEFINITIVE_REASONS: ReadonlySet<AvailabilityReason> = new Set<AvailabilityReason>([
  "playability_blocked",
  "embed_blocked",
  "not_found",
  "missing_embed",
]);

export const SOFT_STRIKES_TO_DEMOTE = 2;

export type ProbeOutcome =
  | "kept" // was available, still is
  | "restored" // was unavailable, probe succeeded
  | "demoted" // flipped to unavailable this probe
  | "strike" // soft failure recorded, still shown
  | "already-down"; // unavailable and still failing

export async function recordProbe(
  camera: CameraRecord,
  verdict: AvailabilityResult
): Promise<ProbeOutcome> {
  const checkedAt = nowIso();

  if (verdict.available) {
    await execute(
      `UPDATE camera_ytb
       SET link_available = 1, consecutive_failures = 0, unavailable_since = NULL,
           retired_at = NULL, last_check = ?
       WHERE camera_id = ?`,
      checkedAt,
      camera.id
    );
    return camera.linkAvailable ? "kept" : "restored";
  }

  const strikes = (camera.consecutiveFailures ?? 0) + 1;
  const demote =
    DEFINITIVE_REASONS.has(verdict.reason) || strikes >= SOFT_STRIKES_TO_DEMOTE;

  if (!demote) {
    await execute(
      `UPDATE camera_ytb SET consecutive_failures = ?, last_check = ? WHERE camera_id = ?`,
      strikes,
      checkedAt,
      camera.id
    );
    return "strike";
  }

  await execute(
    `UPDATE camera_ytb
     SET link_available = 0, consecutive_failures = ?, last_check = ?,
         unavailable_since = COALESCE(unavailable_since, ?)
     WHERE camera_id = ?`,
    strikes,
    checkedAt,
    checkedAt,
    camera.id
  );
  return camera.linkAvailable ? "demoted" : "already-down";
}

export type VerifySummary = {
  checked: number;
  kept: number;
  restored: number;
  demoted: number;
  strikes: number;
  reasons: Record<string, number>;
  details: Array<{ id: string; outcome: ProbeOutcome; reason?: AvailabilityReason }>;
};

/** Probe each camera once and apply the demotion policy. */
export async function verifyCameras(cameras: CameraRecord[]): Promise<VerifySummary> {
  const summary: VerifySummary = {
    checked: 0,
    kept: 0,
    restored: 0,
    demoted: 0,
    strikes: 0,
    reasons: {},
    details: [],
  };

  for (const camera of cameras) {
    summary.checked++;
    try {
      const verdict = await isCameraAvailable(camera);
      const outcome = await recordProbe(camera, verdict);
      if (outcome === "kept") summary.kept++;
      if (outcome === "restored") summary.restored++;
      if (outcome === "demoted") summary.demoted++;
      if (outcome === "strike") summary.strikes++;
      if (!verdict.available) {
        summary.reasons[verdict.reason] = (summary.reasons[verdict.reason] ?? 0) + 1;
      }
      if (outcome !== "kept") {
        summary.details.push({
          id: camera.id,
          outcome,
          reason: verdict.available ? undefined : verdict.reason,
        });
        console.log(`[linkHealth] ${camera.id} ${outcome}`, verdict.reason);
      }
    } catch (error) {
      console.warn("[linkHealth] probe threw for camera", camera.id, error);
    }
  }

  return summary;
}
