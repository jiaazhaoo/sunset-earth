import { describe, expect, it } from "vitest";
import { twoSentences } from "@/lib/wikipedia";

describe("twoSentences", () => {
  it("keeps two sentences and drops long parentheticals", () => {
    const t = twoSentences(
      "The Willis Tower, formerly known and still commonly referred to as the Sears Tower, is a 110-story, 1,451-foot (442.3 m) skyscraper in the Loop of Chicago, Illinois, United States. Designed by architect Bruce Graham and engineer Fazlur Rahman Khan of Skidmore, Owings & Merrill (SOM), it opened in 1973. It was the tallest building in the world for nearly 25 years."
    );
    expect(t.startsWith("The Willis Tower")).toBe(true);
    expect(t).not.toContain("tallest building");
    expect(t.length).toBeLessThanOrEqual(280);
  });
  it("caps runaway first sentences", () => {
    const long = "A ".repeat(300) + "end.";
    expect(twoSentences(long).length).toBeLessThanOrEqual(280);
    expect(twoSentences(long).endsWith("…")).toBe(true);
  });
});

describe("twoSentences (brackets)", () => {
  it("strips nested pronunciation brackets", () => {
    const t = twoSentences("Shizuoka (Japanese: 静岡市, [ɕi.(d)zɯ.o.kaꜜ.ɕi]) is the capital city of Shizuoka Prefecture, Japan, and the prefecture's second-largest city. It is the seat of the prefectural government.");
    expect(t).toBe("Shizuoka is the capital city of Shizuoka Prefecture, Japan, and the prefecture's second-largest city. It is the seat of the prefectural government.");
  });
});
