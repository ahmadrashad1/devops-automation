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
- **2026-03-18**: Implemented real pipeline engine MVP: API clones repo to read `.saas/pipeline.yaml` (fallback `pipeline.yaml`), parses stages/jobs, persists `pipeline_stages` + `jobs`, enqueues first stage jobs; API orchestrates subsequent stages via worker completion callbacks.
- **2026-03-18**: Worker now performs real work for `pipeline-job`: clones repo at commit SHA, runs scripts inside Docker image, captures logs, writes a basic artifacts folder (logs file), and calls back API to advance stages.

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

## Real pipeline execution (MVP)

To run a real pipeline from a repo, the repo must contain a pipeline file:

- Primary: `.saas/pipeline.yaml`
- Fallback: `pipeline.yaml`

Minimal example:

```yaml
pipeline:
  stages: [build, test]

build:
  stage: build
  image: alpine:3.20
  script:
    - echo "build step"

test:
  stage: test
  image: alpine:3.20
  script:
    - echo "test step"
```

Start infra:

```bash
docker compose up -d
```

Start API (example with port 3010):

```bash
PORT=3010 DATABASE_URL=postgresql://devops:devops@localhost:5432/devops_automation REDIS_URL=redis://localhost:6379 JOB_QUEUE_NAME=jobs pnpm dev:api
```

Start worker (must have Docker + Git installed locally):

```bash
API_BASE_URL=http://localhost:3010 REDIS_URL=redis://localhost:6379 JOB_QUEUE_NAME=jobs pnpm dev:worker
```

Trigger webhook (example):

```bash
curl -X POST http://localhost:3010/api/webhooks/github \
  -H "Content-Type: application/json" \
  -d '{
    "repository": { "clone_url": "https://github.com/your-org/your-repo.git", "name": "your-repo" },
    "after": "YOUR_COMMIT_SHA",
    "ref": "refs/heads/main"
  }'
```

## Environment variables (dev)

API:

- `PORT` (default `3000`)
- `REDIS_URL` (default `redis://localhost:6379`)
- `JOB_QUEUE_NAME` (default `jobs`)
- `DATABASE_URL` (default `postgresql://devops:devops@localhost:5432/devops_automation`)

Worker (log streaming + artifacts):

- `API_BASE_URL` (default `http://localhost:3010`)
- `LOG_FLUSH_INTERVAL_MS` (default `1000`)
- `LOG_FLUSH_MAX_CHARS` (default `65536`)
- `JOB_TIMEOUT_MS` (default `900000`)
- `DOCKER_CPUS` (optional; example `1`)
- `DOCKER_MEMORY` (optional; example `512m`)
- `ARTIFACTS_ROOT` (default `./artifacts` relative to the worker process)

Artifacts are stored on disk at:

- `services/worker/artifacts/<pipelineId>/<stageId>/<jobId>/job.log.txt`

Job logs are also persisted in Postgres (`jobs.logs`) via log streaming.

## Quick local end-to-end test

1. Start infra + services:

```bash
docker compose up -d
PORT=3010 DATABASE_URL=postgresql://devops:devops@localhost:5432/devops_automation REDIS_URL=redis://localhost:6379 JOB_QUEUE_NAME=jobs pnpm dev:api

API_BASE_URL=http://localhost:3010 REDIS_URL=redis://localhost:6379 JOB_QUEUE_NAME=jobs pnpm dev:worker
```

2. Create the demo repo with `.saas/pipeline.yaml`:

```bash
python scripts/create_demo_repo.py
```

3. Trigger the webhook with the printed commit SHA:

```bash
$sha = "<PASTE_COMMIT_SHA>"
$body = @{ repository = @{ clone_url = "D:/automations/devops-automation/test-repos/pipeline-demo"; name = "pipeline-demo" }; after = $sha; ref = "refs/heads/main" } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://localhost:3010/api/webhooks/github -ContentType "application/json" -Body $body
```

4. Verify logs:

- Check `services/worker/artifacts/.../job.log.txt` for both `build step` and `test step`.


