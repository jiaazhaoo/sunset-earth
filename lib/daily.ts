const DAILY_API_BASE_URL =
  process.env.DAILY_API_BASE_URL ?? "https://api.daily.co/v1";
const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_DOMAIN = process.env.DAILY_DOMAIN;

type DailyRoom = {
  name: string;
  url?: string;
};

function assertDailyConfig() {
  if (!DAILY_API_KEY) {
    throw new Error("Missing DAILY_API_KEY env variable");
  }

  if (!DAILY_DOMAIN) {
    throw new Error("Missing DAILY_DOMAIN env variable");
  }
}

function dailyHeaders() {
  assertDailyConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DAILY_API_KEY}`,
  };
}

function roomSlug(roomId: string) {
  return `sunset-${roomId}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

export async function ensureDailyRoom(roomId: string): Promise<DailyRoom> {
  assertDailyConfig();
  const slug = roomSlug(roomId);

  const existing = await fetch(`${DAILY_API_BASE_URL}/rooms/${slug}`, {
    headers: dailyHeaders(),
    cache: "no-store",
  });

  if (existing.ok) {
    return existing.json();
  }

  if (existing.status !== 404) {
    const errorBody = await existing.text();
    throw new Error(
      `Failed to fetch Daily room: ${existing.status} ${errorBody}`
    );
  }

  const createResponse = await fetch(`${DAILY_API_BASE_URL}/rooms`, {
    method: "POST",
    headers: dailyHeaders(),
    body: JSON.stringify({
      name: slug,
      properties: {
        enable_chat: false,
        enable_screenshare: false,
        enable_video_processing_ui: false,
        eject_at_room_exp: true,
      },
      privacy: "private",
    }),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    throw new Error(
      `Failed to create Daily room: ${createResponse.status} ${errorBody}`
    );
  }

  return createResponse.json();
}

export async function createVoiceToken({
  roomId,
  userName,
}: {
  roomId: string;
  userName?: string;
}) {
  const room = await ensureDailyRoom(roomId);

  const response = await fetch(`${DAILY_API_BASE_URL}/meeting-tokens`, {
    method: "POST",
    headers: dailyHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: room.name,
        user_name: userName ?? "Sunset Guest",
        enable_screenshare: false,
        enable_video: false,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to create meeting token: ${response.status} ${errorBody}`
    );
  }

  const payload = await response.json();
  return {
    token: payload.token,
    callUrl: room.url ?? `https://${DAILY_DOMAIN}/${room.name}`,
  };
}
