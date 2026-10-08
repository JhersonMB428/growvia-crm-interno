import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Equipo } from './equipo.entity';
import { Rol } from './rol.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  nombres: string;

  @Column({ length: 80 })
  apellidos: string;

  @Column({ length: 150 })
  email: string;

  // Nunca se envía al frontend (select: false)
  @Column({ name: 'password_hash', length: 100, select: false })
  passwordHash: string;

  @Column({ name: 'rol_id', type: 'smallint' })
  rolId: number;

  @ManyToOne(() => Rol)
  @JoinColumn({ name: 'rol_id' })
  rol: Rol;

  @Column({ name: 'equipo_id', type: 'uuid', nullable: true })
  equipoId: string | null;

  @ManyToOne(() => Equipo, { nullable: true })
  @JoinColumn({ name: 'equipo_id' })
  equipo: Equipo | null;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'aviso_correo', default: true })
  avisoCorreo: boolean;

  @Column({ name: 'minutos_recordatorio', type: 'smallint', default: 30 })
  minutosRecordatorio: number;

  /** Usuario nuevo o contraseña restablecida: debe elegir una propia al entrar */
  @Column({ name: 'clave_temporal', default: false })
  claveTemporal: boolean;

  @Column({ name: 'creado_por', type: 'uuid', nullable: true })
  creadoPor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
