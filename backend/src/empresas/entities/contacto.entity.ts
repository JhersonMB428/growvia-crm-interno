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

  @Column({ type: 'char', length: 9 })
  celular: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  correo: string | null;

  /** 1 = principal, 2 = secundario */
  @Column({ type: 'smallint' })
  posicion: 1 | 2;
}