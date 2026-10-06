import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('equipos')
export class Equipo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 60, unique: true })
  nombre: string;

  @Column({ name: 'supervisor_id', type: 'uuid', nullable: true })
  supervisorId: string | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
