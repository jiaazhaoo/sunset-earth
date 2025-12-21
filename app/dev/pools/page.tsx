'use client';

import { useEffect, useState } from 'react';

type CameraWithPool = {
  id: string;
  name: string;
  city: string;
  country: string;
  score: number | null;
  label: string;
  weatherClass: string;
  poolId: number;
  linkAvailable: boolean;
  tier?: string;
};

export default function PoolsDebugPage() {
  const [cameras, setCameras] = useState<CameraWithPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'pool' | 'name'>('pool');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const results: CameraWithPool[] = [];
        const seenCameraIds = new Set<string>();

        // Fetch all 4 pools
        for (let poolId = 1; poolId <= 5; poolId++) {
          try {
            const res = await fetch(
              `/api/camera-pools/current?poolId=${poolId}&includeUnavailable=1&includeAll=1&includePool5=1`
            );

            // Skip if pool is empty (404)
            if (!res.ok) {
              if (res.status === 404) {
                console.log(`Pool ${poolId} is empty, skipping`);
                continue;
              }
              throw new Error(`Failed to fetch pool ${poolId}: ${res.status}`);
            }

            const data = await res.json();

            // Add cameras from this pool
            for (const camera of data.cameras || []) {
              // Skip if we've already seen this camera (happens when pools fallback)
              if (seenCameraIds.has(camera.id)) {
                continue;
              }
              seenCameraIds.add(camera.id);

              results.push({
                id: camera.id,
                name: camera.name,
                city: camera.city,
                country: camera.country,
                score: camera.score ?? null,
                label: camera.label || 'unknown',
                weatherClass: camera.weatherClass || 'unknown',
                poolId: data.poolId,
                linkAvailable: camera.linkAvailable !== false,
                tier: camera.metadata?.tier || null
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch pool ${poolId}:`, err);
          }
        }

        setCameras(results);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredCameras = filter === 'all'
    ? cameras
    : cameras.filter(c => c.poolId === filter);

  const sortedCameras = [...filteredCameras].sort((a, b) => {
    const scoreA = a.score ?? -Infinity;
    const scoreB = b.score ?? -Infinity;
    if (sortBy === 'score') return scoreB - scoreA;
    if (sortBy === 'pool') return a.poolId - b.poolId || scoreB - scoreA;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  const poolCounts = {
    1: cameras.filter(c => c.poolId === 1).length,
    2: cameras.filter(c => c.poolId === 2).length,
    3: cameras.filter(c => c.poolId === 3).length,
    4: cameras.filter(c => c.poolId === 4).length,
    5: cameras.filter(c => c.poolId === 5).length,
  };

  const poolColors = {
    1: 'bg-amber-100 border-amber-300',
    2: 'bg-orange-100 border-orange-300',
    3: 'bg-blue-100 border-blue-300',
    4: 'bg-gray-100 border-gray-300',
    5: 'bg-red-100 border-red-300',
  };

  const poolNames = {
    1: 'Golden Hour Core',
    2: 'Golden Hour Extended & Blue Hour',
    3: 'Approaching Golden Hour',
    4: 'Daytime & Special Night',
    5: 'Low Quality (Not Displayed)',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Camera Pool Distribution</h1>
          <div className="text-center py-12">Loading cameras...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Camera Pool Distribution</h1>
          <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Camera Pool Distribution</h1>
          <a href="/" className="text-blue-400 hover:text-blue-300 underline">
            ← Back to Home
          </a>
        </div>

        {/* Pool Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[1, 2, 3, 4, 5].map(poolId => (
            <button
              key={poolId}
              onClick={() => setFilter(filter === poolId ? 'all' : poolId)}
              className={`p-4 border-2 rounded-lg transition-all ${
                filter === poolId ? 'ring-2 ring-blue-500' : ''
              } ${poolColors[poolId as keyof typeof poolColors]}`}
            >
              <div className="text-2xl font-bold">{poolCounts[poolId as keyof typeof poolCounts]}</div>
              <div className="text-sm font-medium">Pool {poolId}</div>
              <div className="text-xs mt-1 opacity-75">
                {poolNames[poolId as keyof typeof poolNames]}
              </div>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="bg-gray-900 border border-gray-700 p-4 rounded-lg shadow mb-6 flex gap-4 items-center">
          <div>
            <label className="text-sm font-medium mr-2 text-gray-300">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-gray-600 rounded px-3 py-1 bg-gray-800 text-white"
            >
              <option value="pool">Pool</option>
              <option value="score">Score</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mr-2 text-gray-300">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="border border-gray-600 rounded px-3 py-1 bg-gray-800 text-white"
            >
              <option value="all">All Pools</option>
              <option value="1">Pool 1</option>
              <option value="2">Pool 2</option>
              <option value="3">Pool 3</option>
              <option value="4">Pool 4</option>
              <option value="5">Pool 5</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-400">
            Showing {sortedCameras.length} of {cameras.length} cameras
          </div>
        </div>

        {/* Camera Table */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Pool
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Camera
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Label
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Weather
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-700">
              {sortedCameras.map((camera) => (
                <tr key={camera.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${
                      poolColors[camera.poolId as keyof typeof poolColors]
                    }`}>
                      Pool {camera.poolId}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-lg font-bold text-white">{camera.score}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-white">
                  <a
                    href={`/?camera=${camera.id}`}
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                  >
                    {camera.name}
                    {camera.tier && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        ({camera.tier})
                      </span>
                    )}
                  </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {camera.city}, {camera.country}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <code className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs">
                      {camera.label}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <code className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs">
                      {camera.weatherClass}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {camera.linkAvailable ? (
                      <span className="text-green-400 text-sm">✓ Available</span>
                    ) : (
                      <span className="text-red-400 text-sm">✗ Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
