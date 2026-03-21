import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { DatabaseModule } from './modules/database/database.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { PipelinesReadModule } from './modules/pipelines-read/pipelines-read.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    DatabaseModule,
    PipelineModule,
    PipelinesReadModule,
    ProjectsModule,
    AiModule,
    OrchestratorModule,
    HealthModule,
    JobsModule,
    WebhooksModule
  ]
})
export class AppModule {}

