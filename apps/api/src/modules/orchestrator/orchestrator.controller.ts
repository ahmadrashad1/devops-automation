import { Body, Controller, Logger, Post } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JobsService } from '../jobs/jobs.service';

type JobCompleteBody = {
  jobId: string;
  pipelineId: string;
  stageId: string;
  status: 'success' | 'failed';
  logs?: string;
  artifactsDir?: string;
  repoUrl: string;
  commitSha: string;
  tenantId: string;
  projectId: string;
};

type JobLogsBody = {
  jobId: string;
  logsChunk: string;
};

@Controller('internal')
export class OrchestratorController {
  private readonly logger = new Logger(OrchestratorController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsService
  ) {}

  @Post('jobs/complete')
  async complete(@Body() body: JobCompleteBody) {
    await this.db.completeJob({
      jobId: body.jobId,
      status: body.status,
      logs: body.logs,
      artifactsDir: body.artifactsDir
    });

    if (body.status === 'failed') {
      await this.db.setStageStatus(body.stageId, 'failed');
      await this.db.setPipelineStatus(body.pipelineId, 'failed');
      return { status: 'recorded_failed' };
    }

    const stageSummary = await this.db.stageStatus(body.stageId);
    if (!stageSummary.allSuccess) {
      return { status: 'recorded_partial' };
    }

    await this.db.setStageStatus(body.stageId, 'success');

    const nextStageId = await this.db.getNextStageId(body.pipelineId, body.stageId);
    if (!nextStageId) {
      await this.db.setPipelineStatus(body.pipelineId, 'success');
      return { status: 'pipeline_success' };
    }

    await this.db.setStageStatus(nextStageId, 'running');
    const nextJobs = await this.db.getQueuedJobsForStage(nextStageId);
    for (const j of nextJobs) {
      await this.db.markJobRunning(j.id);
      await this.jobs.enqueuePipelineJob({
        tenantId: body.tenantId,
        projectId: body.projectId,
        pipelineId: body.pipelineId,
        repoUrl: body.repoUrl,
        commitSha: body.commitSha,
        jobId: j.id,
        stageId: nextStageId,
        image: j.image,
        script: j.script
      } as any);
    }

    this.logger.log(`Stage complete; enqueued next stage jobs count=${nextJobs.length}`);
    return { status: 'next_stage_enqueued', count: nextJobs.length };
  }

  @Post('jobs/logs')
  async appendLogs(@Body() body: JobLogsBody) {
    await this.db.appendJobLogs(body.jobId, body.logsChunk);
    return { status: 'logs_appended' };
  }
}

