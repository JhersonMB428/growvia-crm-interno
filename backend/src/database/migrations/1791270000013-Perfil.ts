import { MigrationInterface, QueryRunner } from 'typeorm';

export class Perfil1791270000013 implements MigrationInterface {
  name = 'Perfil1791270000013';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- Cuándo cambió la contraseña por última vez: las sesiones abiertas antes de esa hora dejan de valer
      ALTER TABLE usuarios ADD COLUMN credenciales_at TIMESTAMPTZ NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE usuarios DROP COLUMN credenciales_at;`);
  }
}