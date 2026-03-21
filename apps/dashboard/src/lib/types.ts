export type PipelineSummary = {
  id: string;
  tenant_id: string;
  project_id: string;
  commit_sha: string;
  branch: string;
  status: string;
  created_at: string;
  source: string;
};

export type StageRow = {
  id: string;
  name: string;
  position: number;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type JobRow = {
  id: string;
  stage_id: string;
  name: string;
  status: string;
  image: string;
  script: unknown;
  logs: string;
  artifacts_dir: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  provider: string;
  created_at: string;
};
