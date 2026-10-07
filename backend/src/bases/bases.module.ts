import { Module } from '@nestjs/common';
import { BasesController } from './bases.controller';
import { BasesService } from './bases.service';

@Module({
  controllers: [BasesController],
  providers: [BasesService],
})
export class BasesModule {}