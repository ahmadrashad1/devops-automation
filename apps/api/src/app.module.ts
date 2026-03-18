import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { DatabaseModule } from './modules/database/database.module';

@Module({
  imports: [DatabaseModule, HealthModule, JobsModule, WebhooksModule]
})
export class AppModule {}

