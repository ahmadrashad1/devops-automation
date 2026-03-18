import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  providers: [PipelineService],
  exports: [PipelineService]
})
export class PipelineModule {}

