import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { JobsModule } from '../jobs/jobs.module';
import { PipelineModule } from '../pipeline/pipeline.module';

@Module({
  imports: [JobsModule, PipelineModule],
  controllers: [WebhooksController]
})
export class WebhooksModule {}

