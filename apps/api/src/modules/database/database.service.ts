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
}

