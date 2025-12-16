# Sunset Earth Documentation Index

## Overview

This directory contains comprehensive documentation for the Sunset Earth project, organized by topic.

## Quick Links

### For New Developers
1. Start with [PROJECT_ORIENTATION.md](../PROJECT_ORIENTATION.md) - High-level project overview
2. Review [Architecture Refactor](architecture/ARCHITECTURE_REFACTOR.md) - Current system design
3. Check [Deployment Guide](deployment/DEPLOYMENT_GUIDE.md) - Setup instructions

### For Feature Development
- [Ranking Algorithm](development/RANKING_ALGORITHM.md) - Camera scoring logic
- [Availability Check Fix](development/AVAILABILITY_CHECK_FIX.md) - Camera health monitoring
- [Algorithm Analysis](development/ALGORITHM_ANALYSIS.md) - Similarity matching details

### For Operations
- [Deployment Checklist](deployment/DEPLOYMENT_CHECKLIST.md) - Pre-deployment verification
- [Cron Optimization Analysis](development/CRON_OPTIMIZATION_ANALYSIS.md) - Job scheduling insights
- [Task Lock Implementation](development/TASK_LOCK_IMPLEMENTATION.md) - Distributed locking

### For ML/AI Work
- [ML Training Plan](ml-training/ML_TRAINING_PLAN.md) - Training strategy and process
- [ML Training Summary](ml-training/ML_TRAINING_SUMMARY.md) - Training results
- [Model Quality Report](ml-training/MODEL_QUALITY_REPORT.md) - Performance metrics

## Documentation Structure

```
docs/
├── architecture/           # System design and architecture decisions
│   ├── ARCHITECTURE_COMPARISON.md
│   └── ARCHITECTURE_REFACTOR.md
│
├── deployment/            # Deployment guides and checklists
│   ├── DEPLOYMENT_GUIDE.md
│   └── DEPLOYMENT_CHECKLIST.md
│
├── development/           # Development notes and technical details
│   ├── ALGORITHM_ANALYSIS.md
│   ├── AVAILABILITY_CHECK_FIX.md
│   ├── CRON_OPTIMIZATION_ANALYSIS.md
│   ├── RANKING_ALGORITHM.md
│   └── TASK_LOCK_IMPLEMENTATION.md
│
└── ml-training/          # Machine learning documentation
    ├── ML_TRAINING_PLAN.md
    ├── ML_TRAINING_SUMMARY.md
    └── MODEL_QUALITY_REPORT.md
```

## Key System Components

### 1. Camera Ranking Pipeline
**Files**: [lib/weather.ts](../lib/weather.ts), [app/api/compute-rankings/route.ts](../app/api/compute-rankings/route.ts)

The ranking system evaluates cameras based on:
- Weather conditions (cloud coverage, visibility)
- Time until next sunset/sunrise
- Geographic location and timezone
- Historical availability

**Documentation**: [Ranking Algorithm](development/RANKING_ALGORITHM.md)

### 2. Link Refresh System
**Files**: [lib/cameraRefresh.ts](../lib/cameraRefresh.ts), [lib/youtube.ts](../lib/youtube.ts)

Smart replacement of unavailable YouTube streams:
- Multi-tier similarity matching (exact, smart, relaxed)
- Geographic synonym awareness
- Keyword-based Jaccard similarity
- Playability verification

**Documentation**: [Algorithm Analysis](development/ALGORITHM_ANALYSIS.md), [Availability Check Fix](development/AVAILABILITY_CHECK_FIX.md)

### 3. ML Pool Manager
**Files**: [lib/poolManager.ts](../lib/poolManager.ts), [scripts/train_model.py](../scripts/train_model.py)

Machine learning model for camera categorization:
- Trained on weather features and camera metadata
- Predicts optimal camera pool assignment
- Deployed as ONNX model for runtime inference

**Documentation**: [ML Training Plan](ml-training/ML_TRAINING_PLAN.md), [Model Quality Report](ml-training/MODEL_QUALITY_REPORT.md)

### 4. Cron Job Architecture
**Files**: [vercel.json](../vercel.json), [lib/task-lock.ts](../lib/task-lock.ts)

Three automated jobs:
- `refresh-links` (hourly): Camera availability and link replacement
- `weather-cache` (3 hours): Weather data fetching
- `compute-rankings` (5 minutes): Camera score calculation

**Documentation**: [Cron Optimization Analysis](development/CRON_OPTIMIZATION_ANALYSIS.md), [Task Lock Implementation](development/TASK_LOCK_IMPLEMENTATION.md)

## Recent Changes

### December 2024 - Smart Link Replacement
- Implemented intelligent similarity matching with geographic knowledge
- Added three-tier matching strategy (exact/smart/relaxed)
- Improved link replacement success rate by 3x

**Details**: See [Recent Updates in README](../README.md#recent-updates)

### December 2024 - Availability Detection Enhancement
- Fixed false positive detection issues
- Added early return optimization
- Enhanced playability status parsing

**Details**: [Availability Check Fix](development/AVAILABILITY_CHECK_FIX.md)

## Development Workflow

### Testing Changes Locally

```bash
# Run development server
npm run dev

# Test specific camera availability
npx tsx scripts/check-cameras.ts

# Export ML training data
npx tsx scripts/export_training_data.ts

# Verify camera pool assignments
npx tsx scripts/verify_camera_123.ts
```

### Archived Scripts

Debug and experimental scripts are archived in `scripts/archive/`:
- `debug-camera-availability/` - Camera health investigation scripts
- `ml-experiments/` - ML model testing and validation scripts

## Contributing

When adding new features:

1. Update relevant documentation in `docs/`
2. Add tests or verification scripts to `scripts/`
3. Update [README.md](../README.md) if user-facing
4. Document any new environment variables

## Support

For questions or issues:
- Review [PROJECT_ORIENTATION.md](../PROJECT_ORIENTATION.md)
- Check existing documentation in this directory
- Examine similar implementations in the codebase
