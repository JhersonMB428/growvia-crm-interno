import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

// Lee el .env de la raíz del repo (o uno dentro de backend si existe). En Azure las variables vienen del contenedor.
config({ path: ['../.env', '.env'] });

// En desarrollo corre con ts-node (archivos .ts); ya compilado, en el contenedor, con .js
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [join(__dirname, '..', '**', `*.entity.${ext}`)],
  migrations: [join(__dirname, 'migrations', `*.${ext}`)],
  // Fechas siempre en hora de Lima, aunque el servidor de Azure esté en UTC
  extra: { options: '-c timezone=America/Lima' },
});