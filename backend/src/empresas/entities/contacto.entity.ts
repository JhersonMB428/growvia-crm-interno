import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cliente } from './cliente.entity';

@Entity('contactos')
export class Contacto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, (c) => c.contactos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @Column({ length: 100 })
  nombre: string;

  @Column({ type: 'char', length: 9, nullable: true })
  celular: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  correo: string | null;

  /** 1 = representante legal, 2 = otro contacto (con teléfono), 3 en adelante = más personas de la empresa */
  @Column({ type: 'smallint' })
  posicion: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  cargo: string | null;

  /** Es quien toma la decisión de compra */
  @Column({ default: false })
  decisor: boolean;

  /** SUNAT, BASE (llegó en una base cargada) o ASESORA (la agregó alguien del equipo) */
  @Column({ type: 'varchar', length: 10, default: 'ASESORA' })
  origen: 'SUNAT' | 'BASE' | 'ASESORA';

  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;
}