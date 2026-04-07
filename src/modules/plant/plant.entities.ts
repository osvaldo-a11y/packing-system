import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('plant_settings')
export class PlantSettings {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Tolerancia de balance de proceso vs salida (porcentaje) */
  @Column({ type: 'decimal', precision: 8, scale: 4, default: 5 })
  yield_tolerance_percent: string;

  /** Rendimiento mínimo aceptable (porcentaje de fruta procesada vs recibida) */
  @Column({ type: 'decimal', precision: 8, scale: 4, default: 70 })
  min_yield_percent: string;

  /** Merma máxima aceptable (porcentaje sobre peso procesado) */
  @Column({ type: 'decimal', precision: 8, scale: 4, default: 15 })
  max_merma_percent: string;

  @UpdateDateColumn()
  updated_at: Date;
}
