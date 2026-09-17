import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture SQL instead of hitting D1.
const executed: Array<{ sql: string; params: unknown[] }> = [];
vi.mock("@/lib/db", () => ({
  execute: vi.fn(async (sql: string, ...params: unknown[]) => {
    executed.push({ sql, params });
    return { success: true };
  }),
  nowIso: () => "2026-09-17T20:00:00.000Z",
}));

import { recordProbe } from "@/lib/linkHealth";
import { buildCameraStub } from "@/lib/cameras";

const up = { ...buildCameraStub("vid"), id: "7", linkAvailable: true, consecutiveFailures: 0 };
const flag = () => /link_available = (\d)/.exec(executed.at(-1)!.sql)?.[1];

beforeEach(() => (executed.length = 0));

describe("recordProbe", () => {
  it("keeps an available camera and clears strikes on success", async () => {
    const outcome = await recordProbe({ ...up, consecutiveFailures: 1 }, { available: true, reason: "ok" });
    expect(outcome).toBe("kept");
    expect(flag()).toBe("1");
    expect(executed.at(-1)!.sql).toContain("consecutive_failures = 0");
  });

  it("restores a demoted camera that probes fine", async () => {
    expect(await recordProbe({ ...up, linkAvailable: false }, { available: true, reason: "ok" })).toBe("restored");
    expect(flag()).toBe("1");
  });

  it("demotes at once on YouTube's own verdicts", async () => {
    for (const reason of ["playability_blocked", "embed_blocked", "not_found"] as const) {
      expect(await recordProbe(up, { available: false, reason })).toBe("demoted");
      expect(flag()).toBe("0");
    }
  });

  it("needs two soft failures in a row before demoting", async () => {
    expect(await recordProbe(up, { available: false, reason: "fetch_error" })).toBe("strike");
    expect(executed.at(-1)!.sql).not.toContain("link_available");
    expect(executed.at(-1)!.params[0]).toBe(1);

    expect(
      await recordProbe({ ...up, consecutiveFailures: 1 }, { available: false, reason: "unavailable_text" })
    ).toBe("demoted");
    expect(flag()).toBe("0");
  });

  it("reports already-down for a camera that stays broken", async () => {
    expect(
      await recordProbe({ ...up, linkAvailable: false }, { available: false, reason: "playability_blocked" })
    ).toBe("already-down");
  });
});
