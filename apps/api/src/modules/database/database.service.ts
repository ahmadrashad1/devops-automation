import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           text NOT NULL,
  repo_url       text NOT NULL,
  default_branch text NOT NULL DEFAULT 'main',
  provider       text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, repo_url)
);

CREATE TABLE IF NOT EXISTS pipelines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha    text NOT NULL,
  branch        text NOT NULL,
  status        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id  uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name         text NOT NULL,
  position     int NOT NULL,
  status       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  UNIQUE (pipeline_id, position)
);

CREATE TABLE IF NOT EXISTS jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id  uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id     uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  name         text NOT NULL,
  status       text NOT NULL,
  image        text NOT NULL,
  script       jsonb NOT NULL,
  logs         text NOT NULL DEFAULT '',
  artifacts_dir text,
  queued_at    timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  UNIQUE (stage_id, name)
);
`;

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor() {
    const databaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://devops:devops@localhost:5432/devops_automation';

    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async onModuleInit() {
    await this.ensureSchema();
  }

  private async ensureSchema() {
    await this.pool.query(SCHEMA_SQL);
    this.logger.log('Database schema ensured');
  }

  async getOrCreateDefaultTenant() {
    const slug = 'default';
    const existing = await this.pool.query(
      'SELECT id, slug, name FROM tenants WHERE slug=$1',
      [slug]
    );
    if (existing.rowCount && existing.rows[0]) return existing.rows[0];

    const created = await this.pool.query(
      'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id, slug, name',
      ['Default Tenant', slug]
    );
    return created.rows[0];
  }

  async getOrCreateProject(params: {
    tenantId: string;
    repoUrl: string;
    name: string;
    provider: string;
    defaultBranch: string;
  }) {
    const existing = await this.pool.query(
      'SELECT id, name, repo_url FROM projects WHERE tenant_id=$1 AND repo_url=$2',
      [params.tenantId, params.repoUrl]
    );
    if (existing.rowCount && existing.rows[0]) return existing.rows[0];

    const created = await this.pool.query(
      `INSERT INTO projects (tenant_id, name, repo_url, provider, default_branch)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, repo_url`,
      [
        params.tenantId,
        params.name,
        params.repoUrl,
        params.provider,
        params.defaultBranch
      ]
    );
    return created.rows[0];
  }

  async createPipeline(params: {
    tenantId: string;
    projectId: string;
    commitSha: string;
    branch: string;
    source: string;
  }) {
    const created = await this.pool.query(
      `INSERT INTO pipelines (tenant_id, project_id, commit_sha, branch, status, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, status, created_at`,
      [
        params.tenantId,
        params.projectId,
        params.commitSha,
        params.branch,
        'queued',
        params.source
      ]
    );
    return created.rows[0];
  }

  async createStagesAndJobs(params: {
    pipelineId: string;
    stages: string[];
    jobs: Array<{
      name: string;
      stage: string;
      image: string;
      script: string[];
    }>;
  }) {
    const stageRows = new Map<string, { id: string; name: string; position: number }>();

    let pos = 1;
    for (const stageName of params.stages) {
      const created = await this.pool.query(
        `INSERT INTO pipeline_stages (pipeline_id, name, position, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, position`,
        [params.pipelineId, stageName, pos, pos === 1 ? 'queued' : 'pending']
      );
      stageRows.set(stageName, created.rows[0]);
      pos += 1;
    }

    const jobIds: Array<{
      id: string;
      name: string;
      stage: string;
      stageId: string;
      image: string;
      script: string[];
    }> = [];

    for (const job of params.jobs) {
      const stage = stageRows.get(job.stage);
      if (!stage) {
        throw new Error(`Job ${job.name} references unknown stage ${job.stage}`);
      }
      const created = await this.pool.query(
        `INSERT INTO jobs (pipeline_id, stage_id, name, status, image, script)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [
          params.pipelineId,
          stage.id,
          job.name,
          'queued',
          job.image,
          JSON.stringify(job.script)
        ]
      );
      jobIds.push({
        id: created.rows[0].id,
        name: job.name,
        stage: job.stage,
        stageId: stage.id,
        image: job.image,
        script: job.script
      });
    }

    return { stages: [...stageRows.entries()], jobs: jobIds };
  }

  async getQueuedJobsForStage(stageId: string) {
    const res = await this.pool.query(
      `SELECT id, name, image, script
       FROM jobs
       WHERE stage_id=$1 AND status='queued'
       ORDER BY name ASC`,
      [stageId]
    );
    return res.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      image: r.image as string,
      script: (r.script as unknown as string[])
    })) as Array<{ id: string; name: string; image: string; script: string[] }>;
  }

  async getFirstStageId(pipelineId: string) {
    const res = await this.pool.query(
      `SELECT id FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position ASC LIMIT 1`,
      [pipelineId]
    );
    return res.rows[0]?.id as string | undefined;
  }

  async markJobRunning(jobId: string) {
    await this.pool.query(
      `UPDATE jobs SET status='running', started_at=now() WHERE id=$1`,
      [jobId]
    );
  }

  async appendJobLogs(jobId: string, logsChunk: string) {
    if (!logsChunk) return;
    await this.pool.query(
      `UPDATE jobs
       SET logs=COALESCE(logs,'') || $2
       WHERE id=$1`,
      [jobId, logsChunk]
    );
  }

  async completeJob(params: {
    jobId: string;
    status: 'success' | 'failed';
    logs?: string;
    artifactsDir?: string;
  }) {
    await this.pool.query(
      `UPDATE jobs
       SET
         status=$2,
         finished_at=now(),
         logs = CASE WHEN $3::text IS NULL THEN logs ELSE $3 END,
         artifacts_dir = CASE WHEN $4::text IS NULL THEN artifacts_dir ELSE $4 END
       WHERE id=$1`,
      [
        params.jobId,
        params.status,
        params.logs ?? null,
        params.artifactsDir ?? null
      ]
    );
  }

  async stageStatus(stageId: string) {
    const jobs = await this.pool.query(
      `SELECT status FROM jobs WHERE stage_id=$1`,
      [stageId]
    );
    const statuses = jobs.rows.map((r) => r.status);
    const anyFailed = statuses.includes('failed');
    const allSuccess = statuses.length > 0 && statuses.every((s) => s === 'success');
    const anyRunning = statuses.includes('running') || statuses.includes('queued');
    return { anyFailed, allSuccess, anyRunning };
  }

  async setStageStatus(stageId: string, status: string) {
    await this.pool.query(
      `UPDATE pipeline_stages
       SET status=$2,
           started_at = CASE WHEN $2='running' AND started_at IS NULL THEN now() ELSE started_at END,
           finished_at = CASE WHEN $2 IN ('success','failed') THEN now() ELSE finished_at END
       WHERE id=$1`,
      [stageId, status]
    );
  }

  async getNextStageId(pipelineId: string, currentStageId: string) {
    const current = await this.pool.query(
      `SELECT position FROM pipeline_stages WHERE id=$1 AND pipeline_id=$2`,
      [currentStageId, pipelineId]
    );
    const pos = current.rows[0]?.position as number | undefined;
    if (!pos) return undefined;
    const next = await this.pool.query(
      `SELECT id FROM pipeline_stages WHERE pipeline_id=$1 AND position=$2`,
      [pipelineId, pos + 1]
    );
    return next.rows[0]?.id as string | undefined;
  }

  async setPipelineStatus(pipelineId: string, status: string) {
    await this.pool.query(`UPDATE pipelines SET status=$2 WHERE id=$1`, [pipelineId, status]);
  }

  async listProjects(limit = 100) {
    const res = await this.pool.query(
      `SELECT id, tenant_id, name, repo_url, default_branch, provider, created_at
       FROM projects
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  }

  async listPipelines(limit = 50) {
    const res = await this.pool.query(
      `SELECT id, tenant_id, project_id, commit_sha, branch, status, created_at, source
       FROM pipelines
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  }

  async getPipelineById(pipelineId: string) {
    const res = await this.pool.query(
      `SELECT id, tenant_id, project_id, commit_sha, branch, status, created_at, source
       FROM pipelines
       WHERE id=$1`,
      [pipelineId]
    );
    return res.rows[0];
  }

  async getPipelineStages(pipelineId: string) {
    const res = await this.pool.query(
      `SELECT id, name, position, status, created_at, started_at, finished_at
       FROM pipeline_stages
       WHERE pipeline_id=$1
       ORDER BY position ASC`,
      [pipelineId]
    );
    return res.rows;
  }

  async getPipelineJobs(pipelineId: string) {
    const res = await this.pool.query(
      `SELECT id, stage_id, name, status, image, script, logs, artifacts_dir, queued_at, started_at, finished_at
       FROM jobs
       WHERE pipeline_id=$1
       ORDER BY queued_at ASC`,
      [pipelineId]
    );
    return res.rows;
  }
}

