import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Permiso } from './permiso.entity';

export type CodigoRol = 'ASESOR' | 'SUPERVISOR' | 'GERENTE' | 'BACKOFFICE' | 'ADMIN';

@Entity('roles')
export class Rol {
  @PrimaryGeneratedColumn({ type: 'smallint' })
  id: number;

  @Column({ length: 30, unique: true })
  codigo: CodigoRol;

  @Column({ length: 60 })
  nombre: string;

  @ManyToMany(() => Permiso)
  @JoinTable({
    name: 'rol_permisos',
    joinColumn: { name: 'rol_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permiso_id', referencedColumnName: 'id' },
  })
  permisos: Permiso[];
}
