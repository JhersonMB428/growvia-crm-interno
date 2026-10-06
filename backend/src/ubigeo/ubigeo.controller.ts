import { Controller, Get, Param } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Listas en cascada: departamento → provincia → distrito (códigos INEI) */
@Controller('ubigeo')
export class UbigeoController {
  constructor(private readonly db: DataSource) {}

  @Get('departamentos')
  departamentos() {
    return this.db.query(`SELECT id, nombre FROM departamentos ORDER BY nombre`);
  }

  @Get('departamentos/:id/provincias')
  provincias(@Param('id') id: string) {
    return this.db.query(`SELECT id, nombre FROM provincias WHERE departamento_id = $1 ORDER BY nombre`, [id]);
  }

  @Get('provincias/:id/distritos')
  distritos(@Param('id') id: string) {
    return this.db.query(`SELECT id, nombre FROM distritos WHERE provincia_id = $1 ORDER BY nombre`, [id]);
  }
}