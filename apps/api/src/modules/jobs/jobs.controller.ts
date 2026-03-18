import { Controller, Post } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('test-job')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  async enqueueTestJob() {
    const result = await this.jobsService.enqueueDummyJob('manual-api');
    return {
      message: 'Test job enqueued',
      jobId: result.jobId
    };
  }
}

