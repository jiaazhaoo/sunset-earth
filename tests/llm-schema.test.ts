import { describe, expect, it } from "vitest";
import { StreamAnalysisSchema } from "@/lib/llm";
import { analyzeTitleByRules } from "@/lib/place-rules";

describe("StreamAnalysisSchema", () => {
  it("accepts what the rule engine produces, so both paths feed the same decision", async () => {
    const a = await analyzeTitleByRules("Anything at all", { geocodeFn: async () => [] });
    expect(StreamAnalysisSchema.safeParse(a).success).toBe(true);
  });
});
