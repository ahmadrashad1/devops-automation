import { Worker, Job } from 'bullmq';
import pino from 'pino';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import fetch from 'node-fetch';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const execFileAsync = promisify(execFile);

function redisConnectionOptions() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379
  };
}

type PipelineJobPayload = {
  tenantId: string;
  projectId: string;
  pipelineId: string;
  repoUrl: string;
  commitSha: string;
  jobId?: string;
};

async function cloneRepo(repoUrl: string, commitSha: string) {
  const workDir = await mkdtemp(join(tmpdir(), 'job-'));
  await execFileAsync('git', ['clone', '--no-checkout', '--depth', '1', repoUrl, workDir]);
  await execFileAsync('git', ['-C', workDir, 'fetch', '--depth', '1', 'origin', commitSha]);
  await execFileAsync('git', ['-C', workDir, 'checkout', commitSha]);
  return workDir;
}

async function postJobLogs(jobId: string, logsChunk: string): Promise<void> {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3010';
  const res = await fetch(`${apiBase}/api/internal/jobs/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId, logsChunk })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API log append failed ${res.status}: ${text}`);
  }
  await res.text().catch(() => '');
}

async function postJobComplete(body: any) {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3010';
  const res = await fetch(`${apiBase}/api/internal/jobs/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API callback failed ${res.status}: ${text}`);
  return text;
}

async function runInDockerStreaming(params: {
  workDir: string;
  jobId: string;
  image: string;
  script: string[];
  onLogChunk: (chunk: string) => Promise<void>;
}) {
  const flushIntervalMs = Number(process.env.LOG_FLUSH_INTERVAL_MS || 1000);
  const flushMaxChars = Number(process.env.LOG_FLUSH_MAX_CHARS || 64 * 1024);
  const jobTimeoutMs = Number(process.env.JOB_TIMEOUT_MS || 15 * 60 * 1000);

  const dockerArgs: string[] = ['run', '--rm'];
  const cpus = process.env.DOCKER_CPUS;
  if (cpus) dockerArgs.push('--cpus', cpus);
  const memory = process.env.DOCKER_MEMORY;
  if (memory) dockerArgs.push('--memory', memory);

  dockerArgs.push(
    '-v',
    `${params.workDir}:/workspace`,
    '-w',
    '/workspace',
    params.image,
    'sh',
    '-c',
    `set -eu; ${params.script.join(' && ')}`
  );

  const child = spawn('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  }, jobTimeoutMs);

  let finalLogs = '';
  let pending = '';
  let lastFlush = Date.now();
  let flushPromise: Promise<void> = Promise.resolve();

  const scheduleFlush = () => {
    if (!pending) return;
    const chunk = pending;
    pending = '';
    lastFlush = Date.now();
    flushPromise = flushPromise
      .then(() => params.onLogChunk(chunk))
      .catch((err) => {
        logger.warn(
          { jobId: params.jobId, err: err?.message || String(err) },
          'Failed to stream logs to API'
        );
      });
  };

  child.stdout.on('data', (buf) => {
    const s = buf.toString('utf8');
    finalLogs += s;
    pending += s;
    if (pending.length >= flushMaxChars || Date.now() - lastFlush >= flushIntervalMs) {
      scheduleFlush();
    }
  });

  child.stderr.on('data', (buf) => {
    const s = buf.toString('utf8');
    finalLogs += s;
    pending += s;
    if (pending.length >= flushMaxChars || Date.now() - lastFlush >= flushIntervalMs) {
      scheduleFlush();
    }
  });

  const exitCode: number = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code: number | null) => resolve(code ?? 1));
  }).finally(() => clearTimeout(timer));

  scheduleFlush();
  await flushPromise;

  if (timedOut) {
    const err: any = new Error(`Job timed out after ${jobTimeoutMs}ms`);
    err.logs = finalLogs.trim();
    throw err;
  }

  if (exitCode !== 0) {
    const err: any = new Error(`docker run failed with exit code ${exitCode}`);
    err.logs = finalLogs.trim();
    throw err;
  }

  return finalLogs.trim();
}

async function runDirectStreaming(params: {
  workDir: string;
  jobId: string;
  script: string[];
  onLogChunk: (chunk: string) => Promise<void>;
}) {
  const flushIntervalMs = Number(process.env.LOG_FLUSH_INTERVAL_MS || 1000);
  const flushMaxChars = Number(process.env.LOG_FLUSH_MAX_CHARS || 64 * 1024);
  const jobTimeoutMs = Number(process.env.JOB_TIMEOUT_MS || 15 * 60 * 1000);

  const child = spawn('sh', ['-c', `set -eu; ${params.script.join(' && ')}`], {
    cwd: params.workDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  }, jobTimeoutMs);

  let finalLogs = '';
  let pending = '';
  let lastFlush = Date.now();
  let flushPromise: Promise<void> = Promise.resolve();

  const scheduleFlush = () => {
    if (!pending) return;
    const chunk = pending;
    pending = '';
    lastFlush = Date.now();
    flushPromise = flushPromise
      .then(() => params.onLogChunk(chunk))
      .catch((err) => {
        logger.warn(
          { jobId: params.jobId, err: err?.message || String(err) },
          'Failed to stream logs to API'
        );
      });
  };

  child.stdout.on('data', (buf) => {
    const s = buf.toString('utf8');
    finalLogs += s;
    pending += s;
    if (pending.length >= flushMaxChars || Date.now() - lastFlush >= flushIntervalMs) {
      scheduleFlush();
    }
  });

  child.stderr.on('data', (buf) => {
    const s = buf.toString('utf8');
    finalLogs += s;
    pending += s;
    if (pending.length >= flushMaxChars || Date.now() - lastFlush >= flushIntervalMs) {
      scheduleFlush();
    }
  });

  const exitCode: number = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code: number | null) => resolve(code ?? 1));
  }).finally(() => clearTimeout(timer));

  scheduleFlush();
  await flushPromise;

  if (timedOut) {
    const err: any = new Error(`Job timed out after ${jobTimeoutMs}ms`);
    err.logs = finalLogs.trim();
    throw err;
  }

  if (exitCode !== 0) {
    const err: any = new Error(`direct run failed with exit code ${exitCode}`);
    err.logs = finalLogs.trim();
    throw err;
  }

  return finalLogs.trim();
}

async function bootstrap() {
  const queueName = process.env.JOB_QUEUE_NAME || 'jobs';

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Received job');

      if (job.name === 'dummy-test-job') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        logger.info({ jobId: job.id }, 'Completed dummy job');
        return { status: 'success' };
      }

      if (job.name !== 'pipeline-job') {
        logger.warn({ jobId: job.id, name: job.name }, 'Unknown job name; skipping');
        return { status: 'skipped' };
      }

      const data = job.data as PipelineJobPayload;
      const workDir = await cloneRepo(data.repoUrl, data.commitSha);

      const image = (data as any).image || 'alpine:3.20';
      const scriptRaw = (data as any).script;
      const script =
        Array.isArray(scriptRaw) && scriptRaw.length > 0
          ? scriptRaw.map(String)
          : ['echo "no script provided"'];
      const stageId = (data as any).stageId as string | undefined;
      const pipelineJobId = data.jobId || String(job.id);

      let status: 'success' | 'failed' = 'success';
      let logs = '';
      let artifactsDir: string | undefined = undefined;

      try {
        const executor = (process.env.JOB_EXECUTOR || 'docker').toLowerCase();
        if (executor === 'direct') {
          logger.warn({ jobId: pipelineJobId }, 'Using direct executor (no Docker isolation)');
          logs = await runDirectStreaming({
            workDir,
            jobId: pipelineJobId,
            script,
            onLogChunk: (chunk) => postJobLogs(pipelineJobId, chunk)
          });
        } else {
          logs = await runInDockerStreaming({
            workDir,
            jobId: pipelineJobId,
            image,
            script,
            onLogChunk: (chunk) => postJobLogs(pipelineJobId, chunk)
          });
        }

        // MVP artifacts: persist logs to disk under ./artifacts (or ARTIFACTS_ROOT).
        const artifactsRoot = process.env.ARTIFACTS_ROOT || join(process.cwd(), 'artifacts');
        artifactsDir = join(artifactsRoot, data.pipelineId, stageId || 'unknown', pipelineJobId);
        await mkdir(artifactsDir, { recursive: true });
        await writeFile(join(artifactsDir, 'job.log.txt'), logs, 'utf8');
      } catch (err: any) {
        status = 'failed';
        const streamed = err?.logs ? String(err.logs) : '';
        logs = `ERROR: ${err?.message || String(err)}\n${err?.stack || ''}\n${streamed}`.trim();

        // still write logs on failure
        const artifactsRoot = process.env.ARTIFACTS_ROOT || join(process.cwd(), 'artifacts');
        artifactsDir = join(artifactsRoot, data.pipelineId, stageId || 'unknown', pipelineJobId);
        await mkdir(artifactsDir, { recursive: true });
        await writeFile(join(artifactsDir, 'job.log.txt'), logs, 'utf8');
      } finally {
        // best-effort cleanup
        await rm(workDir, { recursive: true, force: true });
      }

      if (stageId) {
        await postJobComplete({
          jobId: pipelineJobId,
          pipelineId: data.pipelineId,
          stageId,
          status,
          logs,
          artifactsDir,
          repoUrl: data.repoUrl,
          commitSha: data.commitSha,
          tenantId: data.tenantId,
          projectId: data.projectId
        });
      } else {
        logger.warn({ jobId: job.id }, 'No stageId provided in job payload; cannot orchestrate');
      }

      logger.info({ jobId: job.id, pipelineJobId, status }, 'Pipeline job finished');
      return { status };
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

