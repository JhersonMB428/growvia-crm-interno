import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('permisos')
export class Permiso {
  @PrimaryGeneratedColumn({ type: 'smallint' })
  id: number;

  @Column({ length: 60, unique: true })
  codigo: string;

  @Column({ length: 40 })
  modulo: string;

  @Column({ length: 200 })
  descripcion: string;
}
