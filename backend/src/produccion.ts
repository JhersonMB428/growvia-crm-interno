import { INestApplication, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import * as express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const enProduccion = () => process.env.NODE_ENV === 'production';

/**
 * En Azure el CRM no arranca si falta algo importante: así no queda
 * funcionando a medias (códigos de ingreso en el log, archivos que se pierden, etc.).
 */
export function revisarConfiguracion() {
  if (!enProduccion()) return;
  const e = process.env;
  const faltan: string[] = [];
  if (!e.DATABASE_URL) faltan.push('DATABASE_URL');
  if (!e.JWT_SECRET || e.JWT_SECRET.length < 32 || e.JWT_SECRET.includes('desarrollo')) faltan.push('JWT_SECRET (mínimo 32 caracteres aleatorios)');
  if (!e.FRONTEND_URL?.startsWith('https://')) faltan.push('FRONTEND_URL (con https://)');
  for (const v of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) if (!e[v]) faltan.push(`${v} (sin correo no llegan los códigos de ingreso)`);
  if (!e.AZURE_STORAGE_CONNECTION_STRING) faltan.push('AZURE_STORAGE_CONNECTION_STRING (sin esto los expedientes se pierden al reiniciar)');
  if (faltan.length) throw new Error(`Faltan variables de entorno para producción:\n - ${faltan.join('\n - ')}`);
}

/** Cabeceras de seguridad para todas las respuestas (API y pantallas) */
export function cabecerasSeguridad(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "frame-src 'self' blob:", // visor de documentos del expediente
      "object-src 'self' blob:",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  if (enProduccion()) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * En el contenedor, el mismo backend sirve las pantallas (carpeta public, que arma el Dockerfile).
 * Así todo vive en una sola dirección (crm.growvia.global) y /api no necesita CORS.
 * En desarrollo esa carpeta no existe y las pantallas siguen saliendo de Vite.
 */
export function servirFrontend(app: INestApplication) {
  const carpeta = join(__dirname, '..', 'public');
  if (!existsSync(join(carpeta, 'index.html'))) return;
  const indice = join(carpeta, 'index.html');

  app.use(
    express.static(carpeta, {
      index: false,
      setHeaders: (res, ruta) => {
        // Los archivos de /assets llevan un código en el nombre: se pueden guardar en caché un año
        res.setHeader('Cache-Control', ruta.includes(`${join('public', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  // Cualquier otra ruta que no sea /api (ej. /empresas/123) abre la app y React decide qué mostrar
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  });
  new Logger('Frontend').log(`Pantallas servidas desde ${carpeta}`);
}