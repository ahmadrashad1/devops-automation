import { Worker, Job } from 'bullmq';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function redisConnectionOptions() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379
  };
}

async function bootstrap() {
  const queueName = process.env.JOB_QUEUE_NAME || 'jobs';

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Received job');

      // TODO: Replace with real runner logic. For now just simulate work.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      logger.info({ jobId: job.id }, 'Completed dummy job');

      return { status: 'success' };
    },
    {
      connection: redisConnectionOptions(),
      concurrency: Number(process.env.WORKER_CONCURRENCY || 2)
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });

  logger.info({ queueName }, 'Worker started and listening for jobs');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to bootstrap worker');
  process.exit(1);
});

