import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Contacto } from './contacto.entity';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 11, unique: true })
  ruc: string;

  @Column({ name: 'razon_social', length: 200 })
  razonSocial: string;

  @Column({ name: 'distrito_id', type: 'char', length: 6, nullable: true })
  distritoId: string | null;

  /** NULL = empresa libre en el repositorio */
  @Column({ name: 'asesor_id', type: 'uuid', nullable: true })
  asesorId: string | null;

  @Column({ type: 'varchar', length: 12 })
  origen: 'BASE' | 'PROSPECCION';

  @Column({ type: 'varchar', length: 10, default: 'PROSPECTO' })
  estado: 'PROSPECTO' | 'VENTA';

  @Column({ name: 'lote_id', type: 'uuid', nullable: true })
  loteId: string | null;

  @Column({ name: 'ultima_gestion_at', type: 'timestamptz', nullable: true })
  ultimaGestionAt: Date | null;

  @Column({ name: 'asignado_at', type: 'timestamptz', nullable: true })
  asignadoAt: Date | null;

  @Column({ name: 'creado_por', type: 'uuid', nullable: true })
  creadoPor: string | null;

  @OneToMany(() => Contacto, (c) => c.cliente)
  contactos: Contacto[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}