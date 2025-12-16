# Sunset Earth

A Next.js application that intelligently displays live camera feeds showing beautiful sunrises and sunsets from around the world, powered by weather-based ranking and ML optimization.

## Features

- **Intelligent Camera Ranking**: Weather-based scoring system that ranks cameras by their sunset/sunrise quality
- **Automatic Link Refresh**: Smart YouTube link replacement with multi-tier similarity matching
- **ML-Enhanced Optimization**: Machine learning model for camera pool assignment
- **Real-time Availability Checking**: Monitors camera feed health and automatically replaces unavailable streams
- **Cron Job Automation**: Scheduled tasks for weather caching, ranking computation, and link maintenance

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account with database setup
- Environment variables configured (see `.env.example`)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Environment Variables

Create a `.env.local` file with:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CRON_SECRET=your_cron_secret
```

## Architecture

### Key Components

- **Camera Ranking System** ([lib/weather.ts](lib/weather.ts)): Scores cameras based on weather conditions, time until sunset/sunrise, and visibility
- **Availability Detection** ([lib/availability.ts](lib/availability.ts)): Enhanced YouTube playability checking with multiple detection methods
- **Smart Link Refresh** ([lib/cameraRefresh.ts](lib/cameraRefresh.ts)): Three-tier similarity matching (exact, smart, relaxed) for finding replacement streams
- **ML Pool Assignment** ([lib/poolManager.ts](lib/poolManager.ts)): Machine learning model for camera categorization

### Cron Jobs

Configured in [vercel.json](vercel.json):

- **refresh-links** (hourly): Checks camera availability and replaces broken links
- **weather-cache** (every 3 hours): Fetches and caches weather data
- **compute-rankings** (every 5 minutes): Recalculates camera scores

### Database Schema

Main tables in Supabase:
- `camera_ytb`: Camera metadata and YouTube links
- `camera_rankings`: Computed scores and availability status
- `task_locks`: Distributed lock mechanism for cron jobs
- `camera_pool_assignments`: ML-based camera categorization

## Project Structure

```
/app                    # Next.js app directory
  /api                  # API routes
    /compute-rankings   # Camera ranking computation
    /refresh-links      # Link availability and replacement
    /weather-cache      # Weather data caching
/lib                    # Core libraries
  availability.ts       # Camera availability checking
  cameraRefresh.ts      # Smart link replacement
  weather.ts            # Weather scoring algorithm
  youtube.ts            # YouTube API and similarity matching
  poolManager.ts        # ML model integration
/scripts                # Utility scripts
  /archive              # Archived debug scripts
/docs                   # Documentation
  /architecture         # Architecture documents
  /deployment           # Deployment guides
  /development          # Development notes
  /ml-training          # ML training documentation
```

## Documentation

- [Architecture Overview](docs/architecture/ARCHITECTURE_REFACTOR.md)
- [Deployment Guide](docs/deployment/DEPLOYMENT_GUIDE.md)
- [Camera Availability Fix](docs/development/AVAILABILITY_CHECK_FIX.md)
- [Ranking Algorithm](docs/development/RANKING_ALGORITHM.md)
- [ML Training Plan](docs/ml-training/ML_TRAINING_PLAN.md)

## Recent Updates

### Smart Link Replacement (Dec 2024)

Implemented intelligent similarity matching for camera link replacement:
- **Geographic Synonyms**: Understands location variations (Yellowstone ↔ Geyser, Basin, Old Faithful)
- **Multi-tier Matching**: Three confidence levels (exact 0.75+, smart 0.45+, relaxed 0.3+)
- **Keyword-based Similarity**: Jaccard similarity with stop word filtering
- **Result**: 3x improvement in successful link replacements

### Enhanced Availability Detection (Dec 2024)

Improved YouTube video availability checking:
- Early return optimization for confirmed playable videos
- Enhanced unavailable phrase detection including JSON status checks
- Eliminated false positives from CSS class name detection
- More reliable camera health monitoring

## Deployment

Deploy to Vercel:

```bash
vercel deploy --prod
```

See [Deployment Guide](docs/deployment/DEPLOYMENT_GUIDE.md) for detailed instructions.

## License

Private project
