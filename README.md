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
- **2026-03-21**: Added public read APIs for pipeline visibility (`GET /api/pipelines`, `GET /api/pipelines/:pipelineId`, `GET /api/pipelines/:pipelineId/jobs`) to support dashboard integration.
- **2026-03-21**: Added optional GitHub webhook signature verification using `WEBHOOK_GITHUB_SECRET` and raw request body (`x-hub-signature-256`).
- **2026-03-21**: **Full-stack dashboard** (pipelines list/detail with live refresh, projects, AI workflow UI) + **AI APIs**: `POST /api/ai/pipeline`, `POST /api/ai/pipeline/fix`, `POST /api/ai/analyze-logs` (OpenAI). CORS enabled for local dashboard; `GET /api/projects` for repo list.
- **2026-03-21**: Dashboard + pnpm: root `.npmrc` hoists Next/React for reliable vendor chunks; `pnpm run clean` / `dev:fresh` in dashboard to clear stale `.next`.
- **2026-03-21**: **Docker Compose**: Postgres + Redis by default; optional **`full`** profile runs **API + worker + dashboard** (`pnpm docker:up`). Worker mounts host `docker.sock` for job containers.

## Running locally (dev)

Prerequisites:

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop
- **Database only:** `docker compose up -d` (Postgres + Redis)
- **Everything in Docker:** `pnpm docker:up` or `docker compose --profile full up --build`

Install dependencies:

```bash
pnpm install
```

Run services in dev mode (from repo root):

```bash
pnpm dev:api       # http://localhost:3000/api/health (use PORT=3010 as in examples below)
pnpm dev:dashboard # http://localhost:3001 (see `apps/dashboard/.env.local.example`)
pnpm dev:worker    # connects to Redis and listens on queue "jobs"
```

You can also run them together:

```bash
pnpm dev
```

### Full stack in Docker (Compose)

From the repo root:

```bash
pnpm docker:up
# equivalent:
# docker compose --profile full up --build
```

Services:

| Service    | Port (host) | Notes |
|------------|-------------|--------|
| Postgres   | 5432        | `devops` / `devops` / `devops_automation` |
| Redis      | 6379        | — |
| API        | 3010        | `DATABASE_URL` / `REDIS_URL` point at compose services |
| Dashboard  | 3001        | Browser uses `NEXT_PUBLIC_API_URL=http://localhost:3010` (baked at image build) |
| Worker     | —           | **`/var/run/docker.sock` mounted** so jobs can `docker run` on your machine |

**AI (Gemini Flash free tier):** put your Google AI Studio key in a **`.env` file in the repo root** (same folder as `docker-compose.yml`):

1. Open [Google AI Studio → Get API key](https://aistudio.google.com/apikey).
2. Create/copy your key.
3. **Use a file named `.env`**, not `.env.example`. Docker Compose only reads **`.env`** in the repo root. Copy the template and edit:
   ```powershell
   copy .env.example .env
   ```
   Then put your key in **`.env`**:
   ```env
   GEMINI_API_KEY=paste_your_key_here
   ```
   **Never commit real keys** — `.env` is gitignored; `.env.example` is a blank template for others.
4. If you also set `OPENAI_API_KEY`, Gemini is still preferred when `GEMINI_API_KEY` is set unless you set `AI_PROVIDER=openai`.

For **local API without Docker**, set the same variable in PowerShell before `pnpm dev:api`:

```powershell
$env:GEMINI_API_KEY="paste_your_key_here"
pnpm dev:api
```

Stop and remove containers: `pnpm docker:down` or `docker compose down`.

**Port 3010 already in use:** something else is bound to `3010` (often `pnpm dev:api` with `PORT=3010`). Either stop that process, or in repo-root **`.env`** set e.g. `API_HOST_PORT=3012` and run `docker compose --profile full up --build` again so the dashboard image picks up `NEXT_PUBLIC_API_URL` for the new port.

**Security:** the worker can start arbitrary images from your pipeline YAML; only use trusted repos and protect the host Docker socket.

## Dashboard troubleshooting (Next.js “Cannot find module … vendor-chunks …”)

This usually means a **stale** `apps/dashboard/.next` folder or pnpm’s symlink layout confusing the dev server.

1. Stop `next dev`.
2. From repo root: `pnpm install` (applies root `.npmrc` hoisting).
3. Clear the cache: `pnpm --filter dashboard run clean` (or delete `apps/dashboard/.next` manually).
4. Start again: `pnpm dev:dashboard` or `pnpm --filter dashboard run dev:fresh` (clean + dev).

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
- `WEBHOOK_GITHUB_SECRET` (optional; enables strict GitHub HMAC signature verification)
- `DASHBOARD_ORIGIN` (optional; comma-separated allowed CORS origins, default `http://localhost:3001,http://localhost:3000`)
- **AI (default: free Gemini when configured):**
  - **`GEMINI_API_KEY`** — from [Google AI Studio](https://aistudio.google.com/apikey). **If set, the API uses Gemini first** (even if `OPENAI_API_KEY` is also set). Use **`AI_PROVIDER=openai`** to force OpenAI when both keys exist.
  - **`GEMINI_MODEL`** (optional; default `gemini-2.0-flash`)
  - **`OPENAI_API_KEY`** / **`OPENAI_MODEL`** — optional paid OpenAI path
  - **`AI_PROVIDER`** — `gemini` or `openai` to force one provider

Dashboard (`apps/dashboard/.env.local`):

- `NEXT_PUBLIC_API_URL` — base URL of the API **without** `/api` (e.g. `http://localhost:3010`)

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

## Pipeline read APIs

- `GET /api/pipelines?limit=50` - list recent pipelines
- `GET /api/pipelines/:pipelineId` - fetch pipeline + stages + jobs
- `GET /api/pipelines/:pipelineId/jobs` - fetch jobs for a pipeline
- `GET /api/projects?limit=100` - list registered projects (repos)

## AI workflow APIs

Requires **`GEMINI_API_KEY`** (Gemini) and/or **`OPENAI_API_KEY`** (OpenAI) on the API process — see env vars above.

- `POST /api/ai/pipeline` — body `{ "prompt": "..." }` → `{ yaml, valid, validationError?, model, provider }` (YAML validated with the same parser as the pipeline engine)
- `POST /api/ai/pipeline/fix` — body `{ "yaml", "validationError", "hint?" }` to repair invalid YAML
- `POST /api/ai/analyze-logs` — body `{ "logs", "jobName?", "context?" }` → failure analysis

## Dashboard

- **Home** `/` — overview
- **Pipelines** `/pipelines` — table of runs (auto-refresh)
- **Pipeline detail** `/pipelines/:id` — stages, jobs, log viewer, **AI log analysis** button
- **Projects** `/projects` — repositories from webhooks
- **AI workflow** `/ai` — generate & fix `pipeline.yaml` from natural language

Copy `apps/dashboard/.env.local.example` to `apps/dashboard/.env.local` and set `NEXT_PUBLIC_API_URL` to match your API (e.g. `http://localhost:3010`).

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


