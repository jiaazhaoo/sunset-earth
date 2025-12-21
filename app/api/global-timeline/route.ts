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

          // Parse as local time in camera's timezone
          const sunrise = new Date(sunriseStr);
          const sunset = new Date(sunsetStr);

          // Blue hour: directly before sunrise, and immediately after sunset (no gaps)
          const blueHourDurationMs = 45 * 60000; // 45 minutes
          const blueHourMorningStart = new Date(sunrise.getTime() - blueHourDurationMs);
          const blueHourMorningEnd = sunrise;
          const blueHourEveningStart = sunset;
          const blueHourEveningEnd = new Date(sunset.getTime() + blueHourDurationMs);

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
