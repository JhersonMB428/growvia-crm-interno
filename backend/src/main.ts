import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas empiezan con /api (ej. /api/salud)
  app.setGlobalPrefix('api');

  // Detrás del balanceador de Azure, para leer la IP real del usuario
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Solo el frontend del CRM puede llamar a la API
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  // Valida y limpia automáticamente los datos que llegan
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API de Growvia CRM en http://localhost:${port}/api`);
}

bootstrap();
