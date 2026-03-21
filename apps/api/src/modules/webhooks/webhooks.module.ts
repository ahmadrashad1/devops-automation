import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PipelineModule } from '../pipeline/pipeline.module';

@Module({
  imports: [PipelineModule],
  controllers: [WebhooksController]
})
export class WebhooksModule {}

