import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SaludController } from './salud.controller';

@Module({
  imports: [
    // Lee el .env de la raíz del repo
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
  ],
  controllers: [SaludController],
})
export class AppModule {}