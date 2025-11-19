const CLOUDFLARE_REALTIME_API_BASE =
  process.env.CLOUDFLARE_REALTIME_API_BASE ??
  "https://api.realtime.cloudflare.com/v2";

const CLOUDFLARE_BASIC_AUTH = process.env.CLOUDFLARE_BASIC_AUTH;
const CLOUDFLARE_REALTIME_PRESET = process.env.CLOUDFLARE_REALTIME_PRESET;

type CloudflareResult<T> = {
  success?: boolean;
  data?: T;
  result?: T;
  errors?: Array<{ message?: string }>;
};

function ensureConfig() {
  if (!CLOUDFLARE_BASIC_AUTH) {
    throw new Error("Missing CLOUDFLARE_BASIC_AUTH env variable");
  }
  if (!CLOUDFLARE_REALTIME_PRESET) {
    throw new Error("Missing CLOUDFLARE_REALTIME_PRESET env variable");
  }
}

function buildAuthHeader() {
  ensureConfig();
  return CLOUDFLARE_BASIC_AUTH!.startsWith("Basic ")
    ? CLOUDFLARE_BASIC_AUTH!
    : `Basic ${CLOUDFLARE_BASIC_AUTH}`;
}

async function callCloudflare<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_REALTIME_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Cloudflare API ${response.status} ${response.statusText}: ${body}`
    );
  }

  const json = (await response.json()) as CloudflareResult<T>;
  if (json.success === false) {
    const details = json.errors?.map((err) => err.message).join(", ");
    throw new Error(details || "Cloudflare API error");
  }

  return (json.data ?? json.result ?? (json as unknown as T)) as T;
}

export async function createRealtimeMeeting(roomId: string) {
  const payload = {
    title: `Sunset Room ${roomId}`,
  };

  const data = await callCloudflare<{ id: string }>("/meetings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!data.id) {
    throw new Error("Cloudflare meeting creation missing id");
  }

  return data.id;
}

export async function createParticipantToken(options: {
  meetingId: string;
  participantName?: string;
  customParticipantId: string;
}) {
  ensureConfig();
  const payload = {
    name: options.participantName ?? "Sunset Guest",
    preset_name: CLOUDFLARE_REALTIME_PRESET,
    custom_participant_id: options.customParticipantId,
  };

  const data = await callCloudflare<{ token: string }>(
    `/meetings/${options.meetingId}/participants`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  if (!data.token) {
    throw new Error("Cloudflare participant response missing token");
  }

  return data.token;
}

export type MeetingParticipant = {
  id: string;
  name?: string;
  custom_participant_id?: string;
  preset_name?: string;
};

export async function listMeetingParticipants(meetingId: string) {
  const data = await callCloudflare<MeetingParticipant[]>(
    `/meetings/${meetingId}/participants`
  );
  if (!Array.isArray(data)) {
    return [];
  }
  return data;
}
