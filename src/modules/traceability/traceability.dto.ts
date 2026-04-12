import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProcessMachineKind } from './traceability.entities';

export class CreateSpeciesDto {
  @IsString() @MinLength(1) @MaxLength(32) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
}

export class UpdateSpeciesDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateProducerDto {
  @IsOptional() @IsString() @MaxLength(32) codigo?: string;
  @IsString() @MinLength(1) @MaxLength(200) nombre: string;
}

export class UpdateProducerDto {
  @IsOptional() @IsString() @MaxLength(32) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateProcessMachineDto {
  @IsString() @MinLength(1) @MaxLength(32) codigo: string;
  @IsString() @MinLength(1) @MaxLength(160) nombre: string;
  @IsEnum(ProcessMachineKind) kind: ProcessMachineKind;
}

export class UpdateProcessMachineDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) nombre?: string;
  @IsOptional() @IsEnum(ProcessMachineKind) kind?: ProcessMachineKind;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateVarietyDto {
  @Type(() => Number) @IsInt() species_id: number;
  @IsOptional() @IsString() @MaxLength(32) codigo?: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
}

export class UpdateVarietyDto {
  @IsOptional() @Type(() => Number) @IsInt() species_id?: number;
  @IsOptional() @IsString() @MaxLength(32) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreatePresentationFormatDto {
  @IsString() @MinLength(1) @MaxLength(20) format_code: string;
  @IsOptional() @Type(() => Number) @IsInt() species_id?: number;
  @IsOptional() @IsString() descripcion?: string;
  /** Peso neto por caja (lb); obligatorio para cálculo tarjas. */
  @Type(() => Number) @IsNumber() @Min(0.0001) net_weight_lb_per_box: number;
  /** Máximo de cajas por pallet/tarja con este formato (opcional). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) max_boxes_per_pallet?: number;
  @IsOptional() @IsIn(['mano', 'maquina']) box_kind?: 'mano' | 'maquina' | null;
  @IsOptional() @IsIn(['generica', 'marca']) clamshell_label_kind?: 'generica' | 'marca' | null;
}

export class UpdatePresentationFormatDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) format_code?: string;
  @IsOptional() @Type(() => Number) @IsInt() species_id?: number;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0001) net_weight_lb_per_box?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) max_boxes_per_pallet?: number | null;
  @IsOptional() @IsIn(['mano', 'maquina']) box_kind?: 'mano' | 'maquina' | null;
  @IsOptional() @IsIn(['generica', 'marca']) clamshell_label_kind?: 'generica' | 'marca' | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateReceptionLineDto {
  @Type(() => Number) @IsInt() species_id: number;
  @Type(() => Number) @IsInt() variety_id: number;
  @Type(() => Number) @IsInt() quality_grade_id: number;
  @IsOptional() @IsString() @MaxLength(160) multivariety_note?: string;
  /** Derivado del envase si se informa `returnable_container_id`. */
  @IsOptional() @IsString() @MaxLength(32) format_code?: string;
  @Type(() => Number) @IsInt() returnable_container_id: number;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
  /** Bruto total opcional (lb). */
  @IsOptional() @IsNumber() @Min(0) gross_lb?: number;
  /** Tara; en flujo nuevo suele ser 0 (neto = productor). */
  @IsOptional() @IsNumber() @Min(0) tare_lb?: number;
  /** Neto lb entregado por el productor (obligatorio en líneas detalladas). */
  @IsNumber() @Min(0) net_lb: number;
  @IsOptional() @IsNumber() temperature_f?: number;
}

export class CreateReceptionDto {
  @IsDateString() received_at: string;
  @IsOptional() @IsString() @MaxLength(64) document_number?: string;
  @Type(() => Number) @IsInt() producer_id: number;
  /** Obligatorio si no enviás `lines`; si hay líneas, se usa la variedad de la primera línea para el encabezado. */
  @ValidateIf((o) => !o.lines?.length)
  @Type(() => Number)
  @IsInt()
  variety_id?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateReceptionLineDto) lines?: CreateReceptionLineDto[];
  @IsOptional() @IsNumber() @Min(0) gross_weight_lb?: number;
  @IsOptional() @IsNumber() @Min(0) net_weight_lb?: number;
  @IsOptional() @IsString() notes?: string;
  /** Ignorado: la referencia la asigna el servidor al guardar. */
  @IsOptional() @IsString() @MaxLength(64) reference_code?: string;
  @IsOptional() @IsString() @MaxLength(64) plant_code?: string;
  @IsOptional() @IsNumber() lbs_reference?: number;
  @IsOptional() @IsNumber() lbs_difference?: number;
  /** Catálogo `document_states` (por defecto borrador en alta). */
  @IsOptional() @Type(() => Number) @IsInt() document_state_id?: number;
  /** Catálogo `reception_types` (ej. Mano / Máquina / Mixto). */
  @IsOptional() @Type(() => Number) @IsInt() reception_type_id?: number;
  /** Catálogo `mercados` (destino comercial). */
  @IsOptional() @Type(() => Number) @IsInt() mercado_id?: number | null;
  @IsOptional() @IsString() @MaxLength(16) weight_basis?: string;
  @IsOptional() @IsString() @MaxLength(20) quality_intent?: string;
}

/** Misma forma que alta; solo recepciones en borrador. */
export class UpdateReceptionDto extends CreateReceptionDto {}

export class TransitionReceptionStateDto {
  @Type(() => Number) @IsInt() document_state_id: number;
}

export class CreateQualityGradeDto {
  @IsString() @MinLength(1) @MaxLength(32) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
  @IsOptional() @IsString() @MaxLength(20) purpose?: string;
}

export class UpdateQualityGradeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(20) purpose?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateProcessResultComponentDto {
  @IsString() @MinLength(1) @MaxLength(32) codigo: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre: string;
  @IsOptional() @Type(() => Number) @IsInt() sort_order?: number;
}

export class UpdateProcessResultComponentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @Type(() => Number) @IsInt() sort_order?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpdateSpeciesProcessComponentsDto {
  @IsArray() @Type(() => Number) @IsInt({ each: true }) active_component_ids: number[];
}
