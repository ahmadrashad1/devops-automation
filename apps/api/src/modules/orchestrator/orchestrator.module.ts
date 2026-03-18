import { Module } from '@nestjs/common';
import { OrchestratorController } from './orchestrator.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [OrchestratorController]
})
export class OrchestratorModule {}

