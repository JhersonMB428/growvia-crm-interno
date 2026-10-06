import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('codigos_verificacion')
export class CodigoVerificacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 'codigo_hash', length: 100 })
  codigoHash: string;

  @Column({ length: 10 })
  proposito: 'LOGIN' | 'RECUPERAR';

  @Column({ name: 'expira_at', type: 'timestamptz' })
  expiraAt: Date;

  @Column({ type: 'smallint', default: 0 })
  intentos: number;

  @Column({ name: 'usado_at', type: 'timestamptz', nullable: true })
  usadoAt: Date | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
