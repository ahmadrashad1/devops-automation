# DevOps Automation SaaS (MVP)

This repository contains a monorepo for a multi-tenant DevOps automation SaaS MVP with:

- **API**: NestJS service (`apps/api`)
- **Dashboard**: Next.js app (`apps/dashboard`)
- **Worker**: Queue-based job worker (`services/worker`)

## 4-week MVP roadmap (high-level)

- **Week 1**: Monorepo scaffolding, API/worker/dashboard skeletons, health checks, local dev setup.
- **Week 2**: Basic multi-tenant models (tenants, users, projects), Git webhook ingestion, simple pipeline model.
- **Week 3**: Job queue integration end-to-end (API → queue → worker), run simple scripted jobs, basic logs in UI.
- **Week 4**: Basic deployment step (kubectl-based), minimal monitoring hooks, polish + harden for demo.

## Progress (dev log)

- **2026-03-18**: Scaffolded monorepo (API, worker, dashboard), added BullMQ-based queue endpoint `POST /api/test-job`, added GitHub-style webhook `POST /api/webhooks/github`.
- **2026-03-18**: Added GitHub Actions workflows for CI build and Docker image build (`.github/workflows/ci.yml`, `.github/workflows/docker-build.yml`).
- **2026-03-18**: Added local `docker-compose.yml` (Postgres + Redis) and started wiring API to persist webhook-triggered pipelines in Postgres (Week 2 foundation).

## Running locally (dev)

Prerequisites:

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop
- Postgres + Redis: `docker compose up -d`

Install dependencies:

```bash
pnpm install
```

Run services in dev mode (from repo root):

```bash
pnpm dev:api       # http://localhost:3000/api/health (set PORT if 3000 is busy)
pnpm dev:dashboard # http://localhost:3001 (if you change port) or 3000 default
pnpm dev:worker    # connects to Redis and listens on queue "jobs"
```

You can also run them together:

```bash
pnpm dev
```

> Note: The worker currently processes dummy jobs; API has a basic `/api/health` endpoint; the dashboard is a simple placeholder page. The next steps are to wire pipelines, queues, and Git webhooks.

## Testing the queue and webhook flow

### Enqueue a dummy test job

With API and worker running and Redis available:

```bash
curl -X POST http://localhost:3000/api/test-job
```

You should see the worker log that it received and completed a job.

### Minimal GitHub-style webhook

The API exposes a basic webhook endpoint:

- `POST http://localhost:3000/api/webhooks/github`

Example payload:

```bash
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -d '{
    "repository": { "clone_url": "https://github.com/example/repo.git" },
    "after": "0123456789abcdef",
    "ref": "refs/heads/main"
  }'
```

This will log the webhook and enqueue a pipeline job on the same queue the worker listens to. Signature verification and full multi-tenant persistence will be added on top of this minimal flow.

## Environment variables (dev)

API:

- `PORT` (default `3000`)
- `REDIS_URL` (default `redis://localhost:6379`)
- `JOB_QUEUE_NAME` (default `jobs`)
- `DATABASE_URL` (default `postgresql://devops:devops@localhost:5432/devops_automation`)


