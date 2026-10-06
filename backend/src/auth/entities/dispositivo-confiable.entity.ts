import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('dispositivos_confiables')
export class DispositivoConfiable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 'huella_hash', length: 100 })
  huellaHash: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  nombre: string | null;

  @Column({ name: 'expira_at', type: 'timestamptz' })
  expiraAt: Date;

  @Column({ name: 'ultimo_uso_at', type: 'timestamptz', nullable: true })
  ultimoUsoAt: Date | null;

  @Column({ name: 'revocado_at', type: 'timestamptz', nullable: true })
  revocadoAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
