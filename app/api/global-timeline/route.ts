import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type CameraRow = {
  camera_id: string;
  ytb_title: string | null;
  placename: string | null;
  country: string | null;
  timezone: string | null;
  latitude: number;
  longitude: number;
};

export async function GET() {
  try {
    // Fetch all cameras with valid coordinates and timezone
    const { data: cameras, error } = await supabaseAdmin
      .from('camera_ytb')
      .select('camera_id, ytb_title, placename, country, timezone, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .not('timezone', 'is', null)
      .neq('timezone', '')
      .limit(200);

    if (error) {
      console.error('[global-timeline] Error fetching cameras:', error);
      return NextResponse.json({ error: 'Failed to fetch cameras' }, { status: 500 });
    }

    if (!cameras || cameras.length === 0) {
      return NextResponse.json({ events: [] });
    }

    // Get current date in UTC
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Fetch weather data for each camera
    const events = await Promise.all(
      cameras.map(async (camera: CameraRow) => {
        try {
          const weatherUrl = `https://api.open-meteo.com/v1/forecast?` +
            `latitude=${camera.latitude}&longitude=${camera.longitude}&` +
            `daily=sunrise,sunset&` +
            `timezone=${encodeURIComponent(camera.timezone || 'UTC')}&` +
            `forecast_days=2`;

          const response = await fetch(weatherUrl);
          if (!response.ok) return null;

          const weather = await response.json();
          const dailyIndex = weather.daily?.time?.indexOf(today) ?? 0;

          if (dailyIndex === -1 || !weather.daily?.sunrise?.[dailyIndex] || !weather.daily?.sunset?.[dailyIndex]) {
            return null;
          }

          const sunriseStr = weather.daily.sunrise[dailyIndex];
          const sunsetStr = weather.daily.sunset[dailyIndex];

          const sunrise = parseDateInTimezone(sunriseStr, camera.timezone || 'UTC');
          const sunset = parseDateInTimezone(sunsetStr, camera.timezone || 'UTC');

          if (!sunrise || !sunset) {
            return null;
          }

          // Blue hour：无缝衔接黄金时刻（持续45分钟）
          const blueHourMorningStart = new Date(sunrise.getTime() - 75 * 60000);
          const blueHourMorningEnd = new Date(sunrise.getTime() - 30 * 60000);
          const blueHourEveningStart = new Date(sunset.getTime() + 30 * 60000);
          const blueHourEveningEnd = new Date(sunset.getTime() + 75 * 60000);

          return {
            cameraId: camera.camera_id,
            cameraName: camera.placename || camera.ytb_title || `Camera ${camera.camera_id}`,
            timezone: camera.timezone || 'Unknown',
            country: camera.country || 'Unknown',
            sunrise: sunrise.toISOString(),
            sunset: sunset.toISOString(),
            blueHourMorning: {
              start: blueHourMorningStart.toISOString(),
              end: blueHourMorningEnd.toISOString(),
            },
            blueHourEvening: {
              start: blueHourEveningStart.toISOString(),
              end: blueHourEveningEnd.toISOString(),
            },
          };
        } catch (error) {
          console.error(`[global-timeline] Error fetching weather for camera ${camera.camera_id}:`, error);
          return null;
        }
      })
    );

    const validEvents = events.filter((e): e is NonNullable<typeof e> => e !== null);

    return NextResponse.json({ events: validEvents });
  } catch (error) {
    console.error('[global-timeline] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function parseDateInTimezone(value: string | undefined | null, timezone: string): Date | null {
  if (!value) return null;

  // Already has timezone info
  if (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  try {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
    if (!match) return null;
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    const localTimeStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    const utcDate = new Date(`${localTimeStr}Z`);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });

    const refUtc = new Date(`${year}-${month}-${day}T00:00:00Z`);
    const refFormatted = formatter.format(refUtc);
    const refMatch = /(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/.exec(refFormatted);

    if (!refMatch) {
      const fallback = new Date(`${value}Z`);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    const [, refMonth, refDay, refYear, refHour, refMin, refSec] = refMatch;
    const refLocal = new Date(
      Number.parseInt(refYear),
      Number.parseInt(refMonth) - 1,
      Number.parseInt(refDay),
      Number.parseInt(refHour),
      Number.parseInt(refMin),
      Number.parseInt(refSec)
    );

    const offsetMs = refLocal.getTime() - refUtc.getTime();
    const result = new Date(utcDate.getTime() - offsetMs);
    return Number.isNaN(result.getTime()) ? null : result;
  } catch {
    const fallback = new Date(`${value}Z`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
}
