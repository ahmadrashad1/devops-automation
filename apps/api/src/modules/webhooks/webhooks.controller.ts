import { Body, Controller, Logger, Post } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { DatabaseService } from '../database/database.service';
import { PipelineService } from '../pipeline/pipeline.service';

interface GitHubPushPayload {
  repository?: {
    clone_url?: string;
    name?: string;
  };
  after?: string;
  ref?: string;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly db: DatabaseService,
    private readonly pipelines: PipelineService
  ) {}

  @Post('github')
  async handleGithubPush(@Body() payload: GitHubPushPayload) {
    // TODO: verify signature using a shared secret (X-Hub-Signature-256).
    const repoUrl = payload.repository?.clone_url;
    const commitSha = payload.after;
    const ref = payload.ref;
    const repoName = payload.repository?.name || 'unknown-repo';

    if (!repoUrl || !commitSha) {
      this.logger.warn('Received GitHub webhook without repoUrl or commitSha');
      return { status: 'ignored' };
    }

    const branch = ref?.startsWith('refs/heads/') ? ref.replace('refs/heads/', '') : (ref || 'unknown');

    const tenant = await this.db.getOrCreateDefaultTenant();
    const project = await this.db.getOrCreateProject({
      tenantId: tenant.id,
      repoUrl,
      name: repoName,
      provider: 'github',
      defaultBranch: branch === 'unknown' ? 'main' : branch
    });

    this.logger.log(
      `Received GitHub push webhook: repo=${repoUrl} commit=${commitSha} ref=${ref}`
    );

    const created = await this.pipelines.createPipelineFromRepo({
      tenantId: tenant.id,
      projectId: project.id,
      repoUrl,
      commitSha,
      branch,
      source: 'push'
    });

    return {
      status: 'pipeline_created',
      tenantId: tenant.id,
      projectId: project.id,
      pipelineId: created.pipelineId
    };
  }
}

