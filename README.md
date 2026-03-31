# LoadPulse

LoadPulse now includes:
- A React + Vite dashboard frontend
- A Node.js backend (Express + Socket.IO)
- MongoDB persistence for test runs, live snapshots, and history
- k6-based load test execution

## Current scope implemented

1. Run a new k6 test from the **New Test** page
2. Stream live metrics to the **Dashboard** in real time
3. Persist and show run history in **Test History**

## Environment

Create `.env` from `.env.example` (already added in this repo):

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=loadpulse
MAX_SERIES_POINTS=180
MAX_PERCENTILE_SAMPLES=5000
```

## Local development

Prerequisites:
- Node.js 20+
- MongoDB
- k6 installed and available in PATH

Run:

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API + Socket.IO: `http://localhost:4000`

## API endpoints

- `POST /api/tests/run` - queue a new k6 test run
- `GET /api/dashboard/overview` - dashboard data (live or latest run)
- `GET /api/tests/history` - test run history
- `GET /api/tests/:id` - run details
- `DELETE /api/tests/:id` - delete one run (non-running only)
- `DELETE /api/tests/history` - clear completed history

## Docker deployment

The project includes:
- `Dockerfile` (build frontend + run backend + include k6)
- `docker-compose.yml` (app + MongoDB)

Run with Docker Compose:

```bash
docker compose up --build
```

App will be available at `http://localhost:4000`.
