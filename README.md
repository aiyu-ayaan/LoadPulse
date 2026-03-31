# LoadPulse

LoadPulse now includes:
- A React + Vite dashboard frontend
- A Node.js backend (Express + Socket.IO)
- MongoDB persistence for test runs, live snapshots, and history
- k6-based load test execution

## Current scope implemented

1. Create multiple **Projects** (each with its own website URL)
2. Run tests per project (multiple projects can run tests simultaneously)
3. Stream live metrics to the **Dashboard** in real time
4. Persist and show per-project run history in **Test History**
5. Non-technical dashboard language and health summary for easier understanding

## Environment

Create `.env` from `.env.example` (already added in this repo):

```env
FRONTEND_PORT=5173
BACKEND_PORT=4000
CLIENT_ORIGIN=http://localhost:5173
VITE_API_PROXY_TARGET=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=loadpulse
MAX_SERIES_POINTS=180
MAX_PERCENTILE_SAMPLES=5000
```

Notes:
- `FRONTEND_PORT` controls the Vite dev server port for local development.
- `BACKEND_PORT` controls the Express + Socket.IO server port locally and inside Docker.
- `VITE_API_PROXY_TARGET` is the local dev proxy target for `/api` and `/socket.io`.
- In Docker deployment, the built frontend is served by the backend, so Docker exposes a single web port. `docker-compose.yml` maps `FRONTEND_PORT` on your host to `BACKEND_PORT` inside the container.

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

You can change both from `.env`:
- Frontend: `http://localhost:${FRONTEND_PORT}`
- Backend: `http://localhost:${BACKEND_PORT}`

## API endpoints

- `GET /api/projects` - list projects with run statistics
- `POST /api/projects` - create a project
- `POST /api/tests/run` - queue a new k6 test run
- `GET /api/dashboard/overview?projectId=...` - dashboard data for a project
- `GET /api/tests/history?projectId=...` - test run history for a project
- `GET /api/tests/:id` - run details
- `DELETE /api/tests/:id` - delete one run (non-running only)
- `DELETE /api/tests/history?projectId=...` - clear completed history for a project

## Docker deployment

The project includes:
- `Dockerfile` (build frontend + run backend + include k6)
- `docker-compose.yml` (app + MongoDB)

Run with Docker Compose:

```bash
docker compose up --build
```

By default the app will be available at `http://localhost:4000`.

Docker port behavior:
- Host/public port: `FRONTEND_PORT`
- Container app port: `BACKEND_PORT`

Example:

```env
FRONTEND_PORT=8080
BACKEND_PORT=5000
CLIENT_ORIGIN=http://localhost:8080
GITHUB_CALLBACK_URL=http://localhost:8080/api/auth/github/callback
```

With that setup:
- Docker app opens at `http://localhost:8080`
- The Node server listens on port `5000` inside the container
