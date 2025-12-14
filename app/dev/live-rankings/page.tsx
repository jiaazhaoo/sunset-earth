"use client";

import { useEffect, useState } from "react";

type CameraRanking = {
  cameraId: string;
  name: string;
  score: number;
  label?: string;
  isClear: boolean;
  weatherClass?: string;
  city?: string;
  country?: string;
  nextEvent?: {
    type: "sunrise" | "sunset";
    timeISO: string;
  } | null;
  followingEvent?: {
    type: "sunrise" | "sunset";
    timeISO: string;
  } | null;
};

export default function LiveRankingsPage() {
  const [rankings, setRankings] = useState<CameraRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Update current time every second for countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch rankings
  const fetchRankings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/dev/live-rankings", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();
      setRankings(data.rankings || []);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and every 30 seconds
  useEffect(() => {
    fetchRankings();
    const interval = setInterval(fetchRankings, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (targetISO: string) => {
    const target = new Date(targetISO);
    const diff = target.getTime() - currentTime.getTime();

    if (diff < 0) {
      return "Past";
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const getLabelColor = (label?: string) => {
    switch (label) {
      case "sunset-primary":
        return "bg-orange-500 text-white";
      case "sunrise-primary":
        return "bg-amber-500 text-white";
      case "blue-hour-sunset":
        return "bg-indigo-600 text-white";
      case "blue-hour-sunrise":
        return "bg-indigo-500 text-white";
      case "sunset-extended":
        return "bg-orange-400 text-white";
      case "sunrise-extended":
        return "bg-amber-400 text-white";
      case "street-day":
        return "bg-emerald-500 text-white";
      case "street-night":
        return "bg-emerald-700 text-white";
      case "city-skyline-night":
        return "bg-purple-600 text-white";
      case "clear-day":
        return "bg-sky-400 text-white";
      case "clear":
        return "bg-blue-400 text-white";
      case "night":
        return "bg-slate-600 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  const getWeatherIcon = (weatherClass?: string) => {
    switch (weatherClass) {
      case "clear":
        return "☀️";
      case "partly-cloudy":
        return "⛅";
      case "light-snow":
        return "🌨️";
      default:
        return "☁️";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📊 Live Camera Rankings</h1>
            <p className="text-sm text-slate-400">
              Real-time rankings updated every 30 seconds
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono">
              {currentTime.toLocaleTimeString()}
            </div>
            {lastUpdate && (
              <div className="text-xs text-slate-400">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
        </header>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-slate-800 p-4 shadow-lg">
            <div className="text-sm text-slate-400">Total Cameras</div>
            <div className="text-3xl font-bold">{rankings.length}</div>
          </div>
          <div className="rounded-lg bg-slate-800 p-4 shadow-lg">
            <div className="text-sm text-slate-400">Top Score</div>
            <div className="text-3xl font-bold">
              {rankings.length > 0 ? rankings[0].score : "--"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-800 p-4 shadow-lg">
            <div className="text-sm text-slate-400">Clear Weather</div>
            <div className="text-3xl font-bold">
              {rankings.filter((r) => r.isClear).length}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/50 p-4 text-red-200">
            Error: {error}
          </div>
        )}

        {/* Loading */}
        {loading && rankings.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-lg">Loading rankings...</div>
          </div>
        )}

        {/* Rankings Table */}
        {rankings.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-slate-800 shadow-lg">
            <table className="w-full">
              <thead className="border-b border-slate-700 bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Camera
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Weather
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Next Event
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Countdown
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {rankings.map((ranking, index) => (
                  <tr
                    key={ranking.cameraId}
                    className="transition-colors hover:bg-slate-700/50"
                  >
                    {/* Rank */}
                    <td className="px-4 py-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${
                          index === 0
                            ? "bg-yellow-500 text-black"
                            : index === 1
                              ? "bg-slate-400 text-black"
                              : index === 2
                                ? "bg-orange-600 text-white"
                                : "bg-slate-600 text-white"
                        }`}
                      >
                        {index + 1}
                      </div>
                    </td>

                    {/* Camera */}
                    <td className="px-4 py-3">
                      <div className="font-medium">{ranking.name}</div>
                      <div className="text-xs text-slate-400">
                        {[ranking.city, ranking.country]
                          .filter(Boolean)
                          .join(", ") || `ID: ${ranking.cameraId}`}
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3">
                      <div className="text-lg font-bold">{ranking.score}</div>
                    </td>

                    {/* Status Label */}
                    <td className="px-4 py-3">
                      {ranking.label && (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${getLabelColor(
                            ranking.label
                          )}`}
                        >
                          {ranking.label.replace(/-/g, " ")}
                        </span>
                      )}
                    </td>

                    {/* Weather */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {getWeatherIcon(ranking.weatherClass)}
                        </span>
                        <span className="text-sm capitalize">
                          {ranking.weatherClass?.replace(/-/g, " ") || "N/A"}
                        </span>
                        {ranking.isClear && (
                          <span className="text-xs text-green-400">✓</span>
                        )}
                      </div>
                    </td>

                    {/* Next Event */}
                    <td className="px-4 py-3">
                      {ranking.nextEvent ? (
                        <div className="flex items-center gap-2">
                          <span>
                            {ranking.nextEvent.type === "sunrise"
                              ? "🌅"
                              : "🌇"}
                          </span>
                          <span className="text-sm capitalize">
                            {ranking.nextEvent.type}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">--</span>
                      )}
                    </td>

                    {/* Countdown */}
                    <td className="px-4 py-3">
                      {ranking.nextEvent ? (
                        <div className="font-mono text-sm font-medium text-green-400">
                          {formatCountdown(ranking.nextEvent.timeISO)}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
