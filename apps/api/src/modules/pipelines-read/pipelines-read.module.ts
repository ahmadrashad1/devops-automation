import { Module } from '@nestjs/common';
import { PipelinesReadController } from './pipelines-read.controller';

@Module({
  controllers: [PipelinesReadController]
})
export class PipelinesReadModule {}

