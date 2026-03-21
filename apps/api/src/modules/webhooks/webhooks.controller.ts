import { Body, Controller, Headers, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { createHmac, timingSafeEqual } from 'crypto';

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
    private readonly db: DatabaseService,
    private readonly pipelines: PipelineService
  ) {}

  @Post('github')
  async handleGithubPush(
    @Body() payload: GitHubPushPayload,
    @Headers('x-hub-signature-256') signatureHeader: string | undefined,
    @Req() req: { rawBody?: Buffer; body?: unknown }
  ) {
    this.verifyGithubSignature(req, signatureHeader);

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

  private verifyGithubSignature(
    req: { rawBody?: Buffer; body?: unknown },
    signatureHeader: string | undefined
  ) {
    const secret = process.env.WEBHOOK_GITHUB_SECRET;
    if (!secret) return;

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing GitHub signature');
    }

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const digest = createHmac('sha256', secret).update(raw).digest('hex');
    const expected = Buffer.from(`sha256=${digest}`);
    const provided = Buffer.from(signatureHeader);

    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('Invalid GitHub signature');
    }
  }
}

