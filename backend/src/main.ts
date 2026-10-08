import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { cabecerasSeguridad, revisarConfiguracion, servirFrontend } from './produccion';

/** Junta los mensajes de validación (también los de listas, como los contactos) sin prefijos técnicos */
function mensajes(errores: ValidationError[]): string[] {
  return errores.flatMap((e) => [...Object.values(e.constraints ?? {}), ...mensajes(e.children ?? [])]);
}

async function bootstrap() {
  // En Azure no arranca si falta una variable importante
  revisarConfiguracion();

  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance();

  // Todas las rutas empiezan con /api (ej. /api/salud)
  app.setGlobalPrefix('api');

  // Detrás del balanceador de Azure, para leer la IP real del usuario
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(cabecerasSeguridad);

  // Solo el frontend del CRM puede llamar a la API
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  // Valida y limpia automáticamente los datos que llegan
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errores) => new BadRequestException([...new Set(mensajes(errores))]),
    }),
  );

  // En el contenedor, las pantallas del CRM salen del mismo backend
  servirFrontend(app);

  // Azure avisa antes de apagar el contenedor: se cierran bien las conexiones
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API de Growvia CRM en http://localhost:${port}/api`);
}

bootstrap();