import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PackagingMaterial } from '../packaging/packaging.entities';
import { Mercado } from './catalog.entities';

/** Cliente comercial (despachos, tarjas). Distinto de `sales_orders.cliente_id` legado numérico. */
@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  pais: string | null;

  @Column({ type: 'bigint', nullable: true })
  mercado_id: number | null;

  @ManyToOne(() => Mercado, { nullable: true })
  @JoinColumn({ name: 'mercado_id' })
  mercado?: Mercado | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

/** Marca comercial; opcionalmente vinculada a material de etiqueta para stock. */
@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'bigint', nullable: true })
  label_material_id: number | null;

  @ManyToOne(() => PackagingMaterial, { nullable: true })
  @JoinColumn({ name: 'label_material_id' })
  label_material?: PackagingMaterial | null;

  @Column({ type: 'bigint', nullable: true })
  client_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('packing_suppliers')
export class PackingSupplier {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('packing_material_suppliers')
export class PackingMaterialSupplier {
  @PrimaryColumn({ type: 'bigint' })
  material_id: number;

  @PrimaryColumn({ type: 'bigint' })
  supplier_id: number;

  @ManyToOne(() => PackagingMaterial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'material_id' })
  material: PackagingMaterial;

  @ManyToOne(() => PackingSupplier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplier_id' })
  supplier: PackingSupplier;
}

@Entity('returnable_containers')
export class ReturnableContainer {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 80 })
  tipo: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  capacidad: string | null;

  @Column({ name: 'requiere_retorno', type: 'boolean', default: false })
  requiereRetorno: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

/** Stock agregado de PT por dimensión (cliente / formato / marca). */
@Entity('finished_pt_stock')
export class FinishedPtStock {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint', nullable: true })
  client_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  @Column({ type: 'varchar', length: 20 })
  format_code: string;

  @Column({ type: 'bigint', nullable: true })
  brand_id: number | null;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand | null;

  @Column({ type: 'int', default: 0 })
  boxes: number;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  net_lb: string;

  @UpdateDateColumn()
  updated_at: Date;
}
