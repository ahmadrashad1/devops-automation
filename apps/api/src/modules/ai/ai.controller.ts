import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Generate `.saas/pipeline.yaml` content from natural language. */
  @Post('pipeline')
  async generatePipeline(@Body() body: { prompt?: string }) {
    return this.ai.generatePipeline(body?.prompt ?? '');
  }

  /** Ask the model to repair invalid YAML using validation error text. */
  @Post('pipeline/fix')
  async fixPipeline(
    @Body()
    body: { yaml?: string; validationError?: string; hint?: string }
  ) {
    return this.ai.fixPipeline({
      yaml: body?.yaml ?? '',
      validationError: body?.validationError ?? '',
      hint: body?.hint
    });
  }

  /** Summarize failures and suggest fixes from job logs. */
  @Post('analyze-logs')
  async analyzeLogs(
    @Body()
    body: { logs?: string; jobName?: string; context?: string }
  ) {
    return this.ai.analyzeLogs({
      logs: body?.logs ?? '',
      jobName: body?.jobName,
      context: body?.context
    });
  }
}
