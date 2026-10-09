import { MigrationInterface, QueryRunner } from 'typeorm';

export class Guia1791270000016 implements MigrationInterface {
  name = 'Guia1791270000016';

  public async up(q: QueryRunner): Promise<void> {
    // Cuándo vio el recorrido de bienvenida (NULL = se le muestra al entrar)
    await q.query(`ALTER TABLE usuarios ADD COLUMN guia_vista_at TIMESTAMPTZ NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE usuarios DROP COLUMN guia_vista_at`);
  }
}