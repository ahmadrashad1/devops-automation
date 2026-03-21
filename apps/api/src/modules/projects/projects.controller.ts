import { Controller, Get, Query } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const parsed = Number(limit || 100);
    const safe = Number.isFinite(parsed) ? Math.max(1, Math.min(200, parsed)) : 100;
    const items = await this.db.listProjects(safe);
    return { items };
  }
}
