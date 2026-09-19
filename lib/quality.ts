/**
 * How good is the picture, as opposed to the conditions? Four signals, each
 * a multiplier around 1.0 on the conditions score from lib/client-ranking-v2:
 *
 * - visual: image statistics of the live thumbnail (lib/visual.ts), trusted
 *   only for thumbnails that have been seen to change
 * - resolution: the tallest format the stream offers (lib/availability.ts)
 * - appeal: what viewers did — left within seconds, stayed for minutes, saved
 * - curation: the stars a person gave the camera at /admin/curate
 *
 * Unknown always means 1.0: no signal, no change.
 */

export type Phase = "golden" | "day" | "night";

/** Ranking label → the bucket viewer feedback is kept in. */
export function phaseOf(label: string | null | undefined): Phase {
  if (!label) return "day";
  if (/sunset|sunrise|blue|golden/.test(label)) return "golden";
  if (/night/.test(label)) return "night";
  return "day";
}

/** 0.6 at a black frame, 1.0 at visual 0.8, a small bonus above. */
export function visualFactor(visual: number | null | undefined): number {
  if (visual === null || visual === undefined || Number.isNaN(visual)) return 1;
  return 0.6 + 0.5 * Math.max(0, Math.min(1, visual));
}

/** Full-screen a 480p stream and you see it; 1080p is the norm now. */
export function resolutionFactor(maxHeight: number | null | undefined): number {
  if (!maxHeight || maxHeight <= 0) return 1;
  if (maxHeight >= 1080) return 1;
  if (maxHeight >= 720) return 0.97;
  if (maxHeight >= 480) return 0.85;
  return 0.7;
}

export type FeedbackCounts = { skips: number; dwells: number; favs: number };

/** Fewer weighted events than this and viewers have not spoken yet. */
export const FEEDBACK_MIN_EVENTS = 5;

/**
 * Stays and saves against skips, Laplace-smoothed so a handful of events
 * nudges rather than decides. Ranges 0.85 (all skips) to 1.15 (all stays).
 */
export function appealFactor(fb: FeedbackCounts | null | undefined): number {
  if (!fb) return 1;
  const good = Math.max(0, fb.dwells) + 2 * Math.max(0, fb.favs);
  const total = good + Math.max(0, fb.skips);
  if (total < FEEDBACK_MIN_EVENTS) return 1;
  const appeal = (good + 1) / (total + 2);
  return 0.85 + 0.3 * appeal;
}

/** Stars from /admin/curate: 3 is "as the numbers say", 1 hides it in practice. */
export function curationFactor(rating: number | null | undefined): number {
  switch (rating) {
    case 1:
      return 0.5;
    case 2:
      return 0.75;
    case 3:
      return 1;
    case 4:
      return 1.08;
    case 5:
      return 1.15;
    default:
      return 1;
  }
}

export type QualityInputs = {
  visual?: number | null;
  maxHeight?: number | null;
  feedback?: FeedbackCounts | null;
  rating?: number | null;
};

export function qualityMultiplier(input: QualityInputs): number {
  return (
    visualFactor(input.visual) *
    resolutionFactor(input.maxHeight) *
    appealFactor(input.feedback) *
    curationFactor(input.rating)
  );
}

/** The conditions score with every picture signal applied, clamped to 0..100. */
export function applyQuality(score: number, input: QualityInputs): number {
  return Math.max(0, Math.min(100, Math.round(score * qualityMultiplier(input))));
}
