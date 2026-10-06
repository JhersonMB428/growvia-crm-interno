import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('parametros')
export class Parametro {
  @PrimaryColumn({ length: 60 })
  clave: string;

  @Column({ length: 200 })
  valor: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  descripcion: string | null;

  @Column({ name: 'actualizado_por', type: 'uuid', nullable: true })
  actualizadoPor: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
