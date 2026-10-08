import { Module } from '@nestjs/common';
import { EmbudoController } from './embudo.controller';
import { EmbudoService } from './embudo.service';

@Module({
  controllers: [EmbudoController],
  providers: [EmbudoService],
})
export class EmbudoModule {}