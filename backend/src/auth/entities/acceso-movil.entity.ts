import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EstadoAccesoMovil = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA' | 'REVOCADA';

@Entity('accesos_moviles')
export class AccesoMovil {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ length: 12, default: 'PENDIENTE' })
  estado: EstadoAccesoMovil;

  @Column({ name: 'aprobado_por', type: 'uuid', nullable: true })
  aprobadoPor: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  desde: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  hasta: Date | null;

  @Column({ name: 'revocado_por', type: 'uuid', nullable: true })
  revocadoPor: string | null;

  @Column({ name: 'revocado_at', type: 'timestamptz', nullable: true })
  revocadoAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
