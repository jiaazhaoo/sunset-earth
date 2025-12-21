'use client';

import { useEffect, useState } from 'react';

type SolarEvent = {
  cameraId: string;
  cameraName: string;
  timezone: string;
  country: string;
  sunrise: Date;
  sunset: Date;
  blueHourMorning: { start: Date; end: Date };
  blueHourEvening: { start: Date; end: Date };
};

export function GlobalTimeline() {
  const [events, setEvents] = useState<SolarEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [userTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Initialize current time on client side only
  useEffect(() => {
    setCurrentTime(new Date());
  }, []);

  // Update current time every second
  useEffect(() => {
    if (!currentTime) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [currentTime]);

  // Fetch solar events from all cameras
  useEffect(() => {
    async function fetchEvents() {
      try {
        const response = await fetch('/api/global-timeline');
        if (!response.ok) return;
        const data = await response.json();

        // Convert ISO strings to Date objects
        const parsedEvents = (data.events || []).map((event: any) => ({
          ...event,
          sunrise: new Date(event.sunrise),
          sunset: new Date(event.sunset),
          blueHourMorning: {
            start: new Date(event.blueHourMorning.start),
            end: new Date(event.blueHourMorning.end),
          },
          blueHourEvening: {
            start: new Date(event.blueHourEvening.start),
            end: new Date(event.blueHourEvening.end),
          },
        }));

        setEvents(parsedEvents);
      } catch (error) {
        console.error('Failed to fetch global timeline:', error);
      }
    }
    fetchEvents();
  }, []);

  // Don't render until currentTime is initialized
  if (!currentTime) {
    return null;
  }

  // Get user's local midnight (start of timeline)
  const userMidnight = new Date(currentTime);
  userMidnight.setHours(0, 0, 0, 0);

  // Get next midnight (end of timeline)
  const nextMidnight = new Date(userMidnight);
  nextMidnight.setDate(nextMidnight.getDate() + 1);

  const timelineStartMs = userMidnight.getTime();
  const timelineEndMs = nextMidnight.getTime();
  const timelineDurationMs = timelineEndMs - timelineStartMs;

  // Convert timestamp to percentage position on timeline
  const timeToPercent = (time: Date) => {
    const timeMs = time.getTime();
    const percent = ((timeMs - timelineStartMs) / timelineDurationMs) * 100;
    return Math.max(0, Math.min(100, percent));
  };

  // Current time position
  const currentPercent = timeToPercent(currentTime);

  // Group events by country
  const eventsByCountry = events.reduce((acc, event) => {
    if (!acc[event.country]) {
      acc[event.country] = [];
    }
    acc[event.country].push(event);
    return acc;
  }, {} as Record<string, SolarEvent[]>);

  const countries = Object.keys(eventsByCountry).sort();

  return (
    <div className="w-full bg-zinc-950 py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">
            Global Solar Events Timeline
          </h2>
          <p className="text-zinc-400 text-sm">
            24-hour view from {userTimezone} • {userMidnight.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>

        {/* Timeline Header */}
        <div className="relative mb-6">
          <div className="flex justify-between text-xs text-zinc-500 mb-2">
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
              <div key={hour} className="text-center">
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Timeline Bar */}
          <div className="relative h-2 bg-zinc-800 rounded-full">
            {/* Hour markers */}
            {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
              <div
                key={hour}
                className="absolute top-0 bottom-0 w-px bg-zinc-700"
                style={{ left: `${(hour / 24) * 100}%` }}
              />
            ))}

            {/* Current time indicator */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50 z-10"
              style={{ left: `${currentPercent}%`, marginLeft: '-6px' }}
            >
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-orange-400 font-semibold">
                NOW
              </div>
            </div>
          </div>
        </div>

        {/* Events by Country */}
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {countries.map((country) => (
            <div key={country} className="bg-zinc-900/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                {country} ({eventsByCountry[country].length} cameras)
              </h3>

              <div className="space-y-2">
                {eventsByCountry[country].map((event) => {
                  const sunrisePercent = timeToPercent(event.sunrise);
                  const sunsetPercent = timeToPercent(event.sunset);
                  const blueHourMorningStartPercent = timeToPercent(event.blueHourMorning.start);
                  const blueHourMorningEndPercent = timeToPercent(event.blueHourMorning.end);
                  const blueHourEveningStartPercent = timeToPercent(event.blueHourEvening.start);
                  const blueHourEveningEndPercent = timeToPercent(event.blueHourEvening.end);

                  return (
                    <div key={event.cameraId} className="relative">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-zinc-500 truncate max-w-[200px]">
                          {event.cameraName}
                        </span>
                        <span className="text-xs text-zinc-600">
                          {event.timezone}
                        </span>
                      </div>

                      <div className="relative h-6 bg-zinc-800/50 rounded">
                        {/* Blue Hour Morning */}
                        <div
                          className="absolute top-0 bottom-0 bg-blue-500/30 border-l-2 border-r-2 border-blue-500/50"
                          style={{
                            left: `${blueHourMorningStartPercent}%`,
                            width: `${blueHourMorningEndPercent - blueHourMorningStartPercent}%`,
                          }}
                          title={`Blue Hour (Morning): ${event.blueHourMorning.start.toLocaleTimeString()} - ${event.blueHourMorning.end.toLocaleTimeString()}`}
                        />

                        {/* Sunrise */}
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-yellow-400"
                          style={{ left: `${sunrisePercent}%` }}
                          title={`Sunrise: ${event.sunrise.toLocaleTimeString()}`}
                        >
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            <span className="text-xs">🌅</span>
                          </div>
                        </div>

                        {/* Daytime (between sunrise and sunset) */}
                        <div
                          className="absolute top-0 bottom-0 bg-yellow-500/20"
                          style={{
                            left: `${sunrisePercent}%`,
                            width: `${sunsetPercent - sunrisePercent}%`,
                          }}
                        />

                        {/* Sunset */}
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-orange-400"
                          style={{ left: `${sunsetPercent}%` }}
                          title={`Sunset: ${event.sunset.toLocaleTimeString()}`}
                        >
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            <span className="text-xs">🌇</span>
                          </div>
                        </div>

                        {/* Blue Hour Evening */}
                        <div
                          className="absolute top-0 bottom-0 bg-blue-500/30 border-l-2 border-r-2 border-blue-500/50"
                          style={{
                            left: `${blueHourEveningStartPercent}%`,
                            width: `${blueHourEveningEndPercent - blueHourEveningStartPercent}%`,
                          }}
                          title={`Blue Hour (Evening): ${event.blueHourEvening.start.toLocaleTimeString()} - ${event.blueHourEvening.end.toLocaleTimeString()}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-8 flex flex-wrap gap-4 justify-center text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500/30 border-2 border-blue-500/50 rounded"></div>
            <span>Blue Hour</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-400 rounded"></div>
            <span>Sunrise 🌅</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500/20 rounded"></div>
            <span>Daytime</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-400 rounded"></div>
            <span>Sunset 🌇</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
            <span>Current Time</span>
          </div>
        </div>
      </div>
    </div>
  );
}
