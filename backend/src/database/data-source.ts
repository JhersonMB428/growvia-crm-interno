import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Lee el .env de la raíz del repo (o uno dentro de backend si existe)
config({ path: ['../.env', '.env'] });

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});