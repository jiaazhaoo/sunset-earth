import { beforeEach, describe, expect, it, vi } from "vitest";

const executed: Array<{ sql: string; params: unknown[] }> = [];
const stale = [{ camera_id: "8" }, { camera_id: "20" }];
vi.mock("@/lib/db", () => ({
  execute: vi.fn(async (sql: string, ...params: unknown[]) => { executed.push({ sql, params }); return {}; }),
  query: vi.fn(async (sql: string) => (sql.includes("retired_at IS NULL") ? stale : [])),
  queryOne: vi.fn(async () => null),
  nowIso: () => "2026-10-20T00:00:00.000Z",
  parseJson: (v: unknown) => (typeof v === "string" ? JSON.parse(v) : null),
}));

import { RETIRE_AFTER_DAYS, retireStaleCameras } from "@/lib/discovery";

beforeEach(() => (executed.length = 0));

describe("retireStaleCameras", () => {
  it("retires cameras that have been down longer than the cutoff", async () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const n = await retireStaleCameras(now);
    expect(n).toBe(2);
    expect(executed.map((e) => e.params[1])).toEqual(["8", "20"]);
    expect(executed[0].sql).toContain("retired_at = ?");
  });

  it("uses a 30-day window", () => {
    expect(RETIRE_AFTER_DAYS).toBe(30);
  });
});
