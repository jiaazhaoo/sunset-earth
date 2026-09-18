import { describe, expect, it } from "vitest";
import { analyzeTitleHeuristically, StreamAnalysisSchema } from "@/lib/llm";

describe("analyzeTitleHeuristically", () => {
  it("reads the EarthCam 'Place (City, ST)' shape", () => {
    const a = analyzeTitleHeuristically("EarthCam Live:  Anglins Pier (Lauderdale-By-The-Sea, FL)");
    expect(a.placename).toBe("Anglins Pier");
    expect(a.city).toBe("Lauderdale-By-The-Sea");
    expect(a.country).toBe("FL");
    expect(a.isFixedOutdoorView).toBe(true);
    expect(a.confidence).toBeLessThan(0.5); // never enough to auto-approve
  });

  it("reads 'Place - City, Country' and 4K", () => {
    const a = analyzeTitleHeuristically("🔴 4K Live Webcam Venice - St. Mark's Basin, Italy");
    expect(a.placename.toLowerCase()).toContain("venice");
    expect(a.resolution).toBe("4k");
  });

  it("flags compilations as not a fixed view", () => {
    expect(analyzeTitleHeuristically("🔴 1200 TOP LIVE WEBCAMS around the World").isFixedOutdoorView).toBe(false);
  });

  it("always produces something the schema accepts", () => {
    for (const t of ["", "Live", "Tokyo", "Ski Big Moose Mountain, Maine - Live Cam 1"]) {
      expect(StreamAnalysisSchema.safeParse(analyzeTitleHeuristically(t)).success).toBe(true);
    }
  });
});
