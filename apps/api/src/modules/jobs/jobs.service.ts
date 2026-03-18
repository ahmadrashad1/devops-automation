import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly queue: Queue;

  constructor() {
    const connection = this.redisConnectionOptions();
    const queueName = process.env.JOB_QUEUE_NAME || 'jobs';
    this.queue = new Queue(queueName, { connection });
    this.logger.log(`Jobs queue initialised (name=${queueName})`);
  }

  private redisConnectionOptions() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379
    };
  }

  async enqueueDummyJob(source: string) {
    const jobName = 'dummy-test-job';
    const job = await this.queue.add(jobName, {
      source,
      createdAt: new Date().toISOString()
    });
    this.logger.log(`Enqueued dummy job id=${job.id} name=${jobName}`);
    return { jobId: job.id };
  }

  async enqueuePipelineJob(payload: {
    tenantId: string;
    projectId: string;
    pipelineId: string;
    repoUrl: string;
    commitSha: string;
  }) {
    const jobName = 'pipeline-job';
    const job = await this.queue.add(jobName, payload);
    this.logger.log(
      `Enqueued pipeline job id=${job.id} pipelineId=${payload.pipelineId} tenantId=${payload.tenantId}`
    );
    return { jobId: job.id };
  }
}

