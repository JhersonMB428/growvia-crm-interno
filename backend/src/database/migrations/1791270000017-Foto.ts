import { MigrationInterface, QueryRunner } from 'typeorm';

export class Foto1791270000017 implements MigrationInterface {
  name = 'Foto1791270000017';

  public async up(q: QueryRunner): Promise<void> {
    // Foto de perfil: dónde está guardada y cuándo cambió (sirve para refrescarla en pantalla)
    await q.query(`ALTER TABLE usuarios ADD COLUMN foto_clave VARCHAR(200) NULL, ADD COLUMN foto_at TIMESTAMPTZ NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE usuarios DROP COLUMN foto_at, DROP COLUMN foto_clave`);
  }
}