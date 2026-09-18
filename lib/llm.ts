import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Turn a YouTube live-stream title into the fields a camera_ytb row needs.
 *
 * Optional. lib/place-rules.ts resolves most titles without a model; this is
 * consulted only when the rules are not confident and ANTHROPIC_API_KEY is
 * configured. A few dozen calls a week at most, so the most capable model is
 * the right default.
 */

export const PRIMARY_TYPES = [
  "aurora", "mountain", "ski-resort", "cultural-landmark", "nature",
  "railway-station", "street", "ocean", "city-skyline", "beach", "harbor",
  "railway-view", "village", "airport", "skating-rink", "river", "volcano",
] as const;

// The tag vocabulary already used by curated rows, so filters stay coherent.
export const TAGS = [
  "Street Scene", "Cultural Landmark", "Mountain Range", "Natural Scenery",
  "Railway", "Coastline", "City Skyline", "Wildlife", "Winter Sports", "Urban",
  "Ski Resort", "Arctic Circle", "Lake", "Harbor", "Beach", "Coastal", "Aurora",
  "Airport", "Maritime", "Volcano", "River", "Desert", "Island",
] as const;

export const StreamAnalysisSchema = z.object({
  isFixedOutdoorView: z
    .boolean()
    .describe("True only for a single fixed outdoor camera view. False for multi-camera tours, compilations, indoor, studio, gaming, news, or vehicle-mounted streams."),
  placename: z
    .string()
    .describe("Short name of the exact spot the camera shows, e.g. 'Times Square', 'Nubble Lighthouse', 'Ponte delle Guglie'. Not the city unless the view is the whole city."),
  city: z.string().nullable().describe("City or town, in English."),
  region: z.string().nullable().describe("State / province / region, in English, if known."),
  country: z.string().describe("Country in English, e.g. 'USA', 'Italy', 'Japan'."),
  primaryType: z.enum(PRIMARY_TYPES),
  tags: z.array(z.enum(TAGS)).min(1).max(3),
  resolution: z.enum(["720p", "1080p", "4k"]),
  viewingTime: z.object({
    dayOnly: z.boolean().describe("Nothing to see after dark (unlit nature, beaches)."),
    nightOnly: z.boolean().describe("Only interesting at night (aurora)."),
    noSleepTime: z.boolean().describe("Dead between 22:00 and 06:00 local (streets, stations, airports)."),
    anytime: z.boolean().describe("Worth watching around the clock (lit skylines, harbours)."),
  }),
  weatherTolerance: z.object({
    clear: z.boolean(),
    partlyCloudy: z.boolean(),
    lightRain: z.boolean(),
    lightSnow: z.boolean(),
  }),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How sure you are about the location fields. Below 0.6 if the title does not name a specific place."),
});

export type StreamAnalysis = z.infer<typeof StreamAnalysisSchema>;

const SYSTEM = `You catalogue YouTube live cameras for a site that shows the world's best sunrises and sunsets.
Given a stream's title, channel and description, extract where the camera is and what kind of view it is.
Be literal about the place: prefer the specific landmark, beach, square or building over the city.
Use English names. If the title is not about one fixed outdoor camera, set isFixedOutdoorView=false and still fill the other fields as best you can.`;

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function analyzeStreamTitle(input: {
  title: string;
  channelName?: string | null;
  channelUrl?: string | null;
  description?: string | null;
}): Promise<StreamAnalysis | null> {
  if (!llmConfigured()) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = [
    `Title: ${input.title}`,
    input.channelName ? `Channel: ${input.channelName}` : null,
    input.channelUrl ? `Channel URL: ${input.channelUrl}` : null,
    input.description ? `Description: ${input.description.slice(0, 800)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(StreamAnalysisSchema) },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") {
      console.warn("[llm] refusal", response.stop_details?.category);
      return null;
    }
    return response.parsed_output ?? null;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.warn("[llm] rate limited");
    } else if (error instanceof Anthropic.APIError) {
      console.warn(`[llm] API error ${error.status}: ${error.message}`);
    } else {
      console.warn("[llm] failed", error);
    }
    return null;
  }
}
