import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from 'typeorm';
import { DocumentState, Mercado, ReceptionType } from './catalog.entities';
import { ReturnableContainer } from './operational.entities';

/** Calidad / categoría (ej. FRESH BERRIES, IQF A). */
@Entity('quality_grades')
export class QualityGrade {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** exportacion | proceso | both — filtra uso según intención de la recepción. */
  @Column({ type: 'varchar', length: 20, default: 'both' })
  purpose: string;

  @CreateDateColumn()
  created_at: Date;
}

/** Especie / tipo de cultivo (ej. arándano). Aquí se declara la “fruta” a nivel especie. */
@Entity('species')
export class Species {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('producers')
export class Producer {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  codigo: string | null;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('varieties')
export class Variety {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  species_id: number;

  @ManyToOne(() => Species, { eager: false })
  @JoinColumn({ name: 'species_id' })
  species: Species;

  @Column({ type: 'varchar', length: 32, nullable: true })
  codigo: string | null;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

/** Formato de presentación comercial (NxMoz); opcionalmente asociado a una especie. */
@Entity('presentation_formats')
export class PresentationFormat {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  format_code: string;

  @Column({ type: 'bigint', nullable: true })
  species_id: number | null;

  @ManyToOne(() => Species, { nullable: true })
  @JoinColumn({ name: 'species_id' })
  species?: Species;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  /** Peso neto por caja (lb); usado en tarjas: peso = cajas × peso formato. */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  net_weight_lb_per_box: string;

  /** Tope de cajas por pallet/tarja para este formato (información de planta; puede alimentar recetas). */
  @Column({ type: 'int', nullable: true })
  max_boxes_per_pallet: number | null;

  /** Mano vs máquina (empaque); informa stock / unidad PT. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  box_kind: string | null;

  /** Etiqueta clamshell genérica vs con marca (coherente con operación). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  clamshell_label_kind: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

/** Inicio de trazabilidad: lote recibido en planta con productor y variedad (y por ende especie). */
@Entity('receptions')
export class Reception {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'timestamp' })
  received_at: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  document_number: string | null;

  @Column({ type: 'bigint' })
  producer_id: number;

  @ManyToOne(() => Producer, { eager: false })
  @JoinColumn({ name: 'producer_id' })
  producer: Producer;

  @Column({ type: 'bigint' })
  variety_id: number;

  @ManyToOne(() => Variety, { eager: false })
  @JoinColumn({ name: 'variety_id' })
  variety: Variety;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  gross_weight_lb: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  net_weight_lb: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reference_code: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  plant_code: string | null;

  @Column({ type: 'bigint', nullable: true })
  mercado_id: number | null;

  @ManyToOne(() => Mercado, { nullable: true })
  @JoinColumn({ name: 'mercado_id' })
  mercado?: Mercado | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  lbs_reference: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  lbs_difference: string | null;

  @Column({ type: 'bigint' })
  document_state_id: number;

  @ManyToOne(() => DocumentState)
  @JoinColumn({ name: 'document_state_id' })
  document_state: DocumentState;

  @Column({ type: 'bigint' })
  reception_type_id: number;

  @ManyToOne(() => ReceptionType)
  @JoinColumn({ name: 'reception_type_id' })
  reception_type: ReceptionType;

  @Column({ type: 'varchar', length: 16, default: 'net_lb' })
  weight_basis: string;

  /** exportacion | proceso — debe alinear calidades de línea con `quality_grades.purpose`. */
  @Column({ type: 'varchar', length: 20, default: 'exportacion' })
  quality_intent: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => ReceptionLine, (l) => l.reception)
  lines: Relation<ReceptionLine>[];
}

/** Línea de recepción: especie/variedad/calidad por partida + bruto, tara y neto (trazabilidad tipo “Incoming Fruits”). */
@Entity('reception_lines')
export class ReceptionLine {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  reception_id: number;

  @ManyToOne(() => Reception, (r) => r.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reception_id' })
  reception: Relation<Reception>;

  @Column({ type: 'int', default: 0 })
  line_order: number;

  /** Identificador único de lote: `{referencia_recepción}-L{n}` (n = orden de línea 1-based). */
  @Column({ type: 'varchar', length: 96 })
  lot_code: string;

  @Column({ type: 'bigint' })
  species_id: number;

  @ManyToOne(() => Species, { eager: false })
  @JoinColumn({ name: 'species_id' })
  species: Species;

  @Column({ type: 'bigint' })
  variety_id: number;

  @ManyToOne(() => Variety, { eager: false })
  @JoinColumn({ name: 'variety_id' })
  variety: Variety;

  @Column({ type: 'bigint', nullable: true })
  quality_grade_id: number | null;

  @ManyToOne(() => QualityGrade, { nullable: true })
  @JoinColumn({ name: 'quality_grade_id' })
  quality_grade?: QualityGrade;

  @Column({ type: 'varchar', length: 160, nullable: true })
  multivariety_note: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  format_code: string | null;

  @Column({ type: 'bigint', nullable: true })
  returnable_container_id: number | null;

  @ManyToOne(() => ReturnableContainer, { nullable: true })
  @JoinColumn({ name: 'returnable_container_id' })
  returnable_container?: ReturnableContainer | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  gross_lb: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  tare_lb: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  net_lb: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  temperature_f: string | null;

  @CreateDateColumn()
  created_at: Date;
}

/** Tipo de máquina / línea de proceso en planta (IQF u otras). */
export enum ProcessMachineKind {
  SINGLE = 'single',
  DOUBLE = 'double',
}

@Entity('process_machines')
export class ProcessMachine {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 160 })
  nombre: string;

  @Column({ type: 'varchar', length: 16 })
  kind: ProcessMachineKind;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}

/** Componentes variables de resultado en procesos (ej. IQF, MERMA, JUGO, X). */
@Entity('process_result_components')
export class ProcessResultComponent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;
}

/** Catálogo activo por especie para componentes de resultado de proceso. */
@Entity('species_process_result_components')
@Unique('uq_species_process_component', ['species_id', 'component_id'])
export class SpeciesProcessResultComponent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  species_id: number;

  @ManyToOne(() => Species, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'species_id' })
  species: Species;

  @Column({ type: 'bigint' })
  component_id: number;

  @ManyToOne(() => ProcessResultComponent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'component_id' })
  component: ProcessResultComponent;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;
}
