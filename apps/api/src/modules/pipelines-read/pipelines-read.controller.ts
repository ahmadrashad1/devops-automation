import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('pipelines')
export class PipelinesReadController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const parsed = Number(limit || 50);
    const safeLimit = Number.isFinite(parsed) ? Math.max(1, Math.min(200, parsed)) : 50;
    const pipelines = await this.db.listPipelines(safeLimit);
    return { items: pipelines };
  }

  @Get(':pipelineId')
  async getPipeline(@Param('pipelineId') pipelineId: string) {
    const pipeline = await this.db.getPipelineById(pipelineId);
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const [stages, jobs] = await Promise.all([
      this.db.getPipelineStages(pipelineId),
      this.db.getPipelineJobs(pipelineId)
    ]);

    return { pipeline, stages, jobs };
  }

  @Get(':pipelineId/jobs')
  async getPipelineJobs(@Param('pipelineId') pipelineId: string) {
    const pipeline = await this.db.getPipelineById(pipelineId);
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    const jobs = await this.db.getPipelineJobs(pipelineId);
    return { items: jobs };
  }
}

