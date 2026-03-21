import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController]
})
export class ProjectsModule {}
