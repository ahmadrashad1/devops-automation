import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JobsService } from '../jobs/jobs.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { parsePipelineYamlContent } from './pipeline-yaml.util';

const execFileAsync = promisify(execFile);

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsService
  ) {}

  async createPipelineFromRepo(params: {
    tenantId: string;
    projectId: string;
    repoUrl: string;
    commitSha: string;
    branch: string;
    source: string;
  }) {
    const pipeline = await this.db.createPipeline({
      tenantId: params.tenantId,
      projectId: params.projectId,
      commitSha: params.commitSha,
      branch: params.branch,
      source: params.source
    });

    const config = await this.fetchPipelineConfig({
      repoUrl: params.repoUrl,
      commitSha: params.commitSha
    });

    const { stages, jobs } = parsePipelineYamlContent(config);

    const persisted = await this.db.createStagesAndJobs({
      pipelineId: pipeline.id,
      stages,
      jobs
    });

    // enqueue first stage jobs
    const firstStageId = await this.db.getFirstStageId(pipeline.id);
    if (firstStageId) {
      await this.db.setStageStatus(firstStageId, 'running');
      const stageJobs = await this.db.getQueuedJobsForStage(firstStageId);
      for (const j of stageJobs) {
        await this.db.markJobRunning(j.id);
        await this.jobs.enqueuePipelineJob({
          tenantId: params.tenantId,
          projectId: params.projectId,
          pipelineId: pipeline.id,
          repoUrl: params.repoUrl,
          commitSha: params.commitSha,
          jobId: j.id,
          stageId: firstStageId,
          image: j.image,
          script: j.script
        } as any);
      }
      await this.db.setPipelineStatus(pipeline.id, 'running');
    }

    return { pipelineId: pipeline.id, stageCount: stages.length, jobCount: persisted.jobs.length };
  }

  private async fetchPipelineConfig(params: { repoUrl: string; commitSha: string }) {
    const workDir = await mkdtemp(join(tmpdir(), 'pipeline-'));
    try {
      await execFileAsync('git', ['clone', '--no-checkout', '--depth', '1', params.repoUrl, workDir]);
      await execFileAsync('git', ['-C', workDir, 'fetch', '--depth', '1', 'origin', params.commitSha]);
      await execFileAsync('git', ['-C', workDir, 'checkout', params.commitSha]);

      const primary = join(workDir, '.saas', 'pipeline.yaml');
      const fallback = join(workDir, 'pipeline.yaml');

      try {
        return await readFile(primary, 'utf8');
      } catch {
        return await readFile(fallback, 'utf8');
      }
    } finally {
      // Intentionally leave temp dir cleanup as a follow-up (Windows file locks can be tricky);
      // For MVP we accept temp dirs during dev runs.
      this.logger.debug(`Repo cloned to ${workDir}`);
    }
  }
}

