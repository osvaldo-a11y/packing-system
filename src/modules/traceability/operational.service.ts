import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { PackagingMaterial } from '../packaging/packaging.entities';
import {
  Brand,
  Client,
  FinishedPtStock,
  PackingMaterialSupplier,
  PackingSupplier,
  ReturnableContainer,
} from './operational.entities';
import {
  CreateBrandDto,
  CreateClientDto,
  CreateDocumentStateDto,
  CreateMaterialCategoryDto,
  CreateMercadoDto,
  CreatePackingSupplierDto,
  CreateReceptionTypeDto,
  CreateReturnableContainerDto,
  LinkMaterialSupplierDto,
  UpdatePackingMaterialLinkDto,
  UpdateBrandDto,
  UpdateClientDto,
  UpdateDocumentStateDto,
  UpdateMaterialCategoryDto,
  UpdateMercadoDto,
  UpdatePackingSupplierDto,
  UpdateReceptionTypeDto,
  UpdateReturnableContainerDto,
} from './operational.dto';
import { DocumentState, MaterialCategory, Mercado, ReceptionType } from './catalog.entities';
import { MasterUsageService } from './master-usage.service';

@Injectable()
export class OperationalService {
  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(PackingSupplier) private readonly packingSupplierRepo: Repository<PackingSupplier>,
    @InjectRepository(PackingMaterialSupplier) private readonly pmsRepo: Repository<PackingMaterialSupplier>,
    @InjectRepository(ReturnableContainer) private readonly containerRepo: Repository<ReturnableContainer>,
    @InjectRepository(FinishedPtStock) private readonly ptStockRepo: Repository<FinishedPtStock>,
    @InjectRepository(PackagingMaterial) private readonly materialRepo: Repository<PackagingMaterial>,
    @InjectRepository(Mercado) private readonly mercadoRepo: Repository<Mercado>,
    @InjectRepository(MaterialCategory) private readonly materialCategoryRepo: Repository<MaterialCategory>,
    @InjectRepository(ReceptionType) private readonly receptionTypeRepo: Repository<ReceptionType>,
    @InjectRepository(DocumentState) private readonly documentStateRepo: Repository<DocumentState>,
    private readonly masterUsage: MasterUsageService,
  ) {}

  private isDeactivating(rowActivo: boolean, dtoActivo?: boolean): boolean {
    return rowActivo && dtoActivo === false;
  }

  private isPgForeignKeyViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as { driverError?: { code?: string } }).driverError?.code === '23503';
  }

  private async assertUniqueCodigoNombre(
    repo: Repository<{ id: number; codigo: string; nombre: string }>,
    codigo: string,
    nombre: string,
    excludeId?: number,
  ) {
    const alias = 'x';
    const qb = repo
      .createQueryBuilder(alias)
      .where(
        `(LOWER(TRIM(${alias}.codigo)) = LOWER(TRIM(:c)) OR LOWER(TRIM(${alias}.nombre)) = LOWER(TRIM(:n)))`,
        { c: codigo, n: nombre },
      );
    if (excludeId != null) qb.andWhere(`${alias}.id != :id`, { id: excludeId });
    if (await qb.getOne()) throw new BadRequestException('Ya existe otro registro con el mismo código o nombre.');
  }

  listClients(includeInactive = false) {
    return this.clientRepo.find({
      where: includeInactive ? {} : { activo: true },
      relations: ['mercado'],
      order: { nombre: 'ASC' },
    });
  }

  async createClient(dto: CreateClientDto) {
    if (dto.mercado_id != null && dto.mercado_id > 0) {
      const m = await this.mercadoRepo.findOne({ where: { id: dto.mercado_id } });
      if (!m) throw new BadRequestException('mercado_id inválido');
    }
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.clientRepo, codigo, nombre);
    return this.clientRepo.save(
      this.clientRepo.create({
        codigo,
        nombre,
        pais: dto.pais?.trim() || null,
        mercado_id: dto.mercado_id != null && dto.mercado_id > 0 ? dto.mercado_id : null,
      }),
    );
  }

  async updateClient(id: number, dto: UpdateClientDto) {
    const row = await this.clientRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Cliente no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateClient(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toUpperCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.clientRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.pais !== undefined) row.pais = dto.pais?.trim() || null;
    if (dto.mercado_id !== undefined) {
      if (dto.mercado_id != null && dto.mercado_id > 0) {
        const m = await this.mercadoRepo.findOne({ where: { id: dto.mercado_id } });
        if (!m) throw new BadRequestException('mercado_id inválido');
        row.mercado_id = dto.mercado_id;
      } else {
        row.mercado_id = null;
      }
    }
    if (dto.activo != null) row.activo = dto.activo;
    return this.clientRepo.save(row);
  }

  async deleteClient(id: number) {
    const row = await this.clientRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Cliente no encontrado');
    await this.masterUsage.assertCanDeactivateClient(id);
    try {
      await this.clientRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este cliente porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  listMercados(includeInactive = false) {
    return this.mercadoRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createMercado(dto: CreateMercadoDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.mercadoRepo, codigo, nombre);
    return this.mercadoRepo.save(
      this.mercadoRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updateMercado(id: number, dto: UpdateMercadoDto) {
    const row = await this.mercadoRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Mercado no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateMercado(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toUpperCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.mercadoRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.mercadoRepo.save(row);
  }

  async deleteMercado(id: number) {
    const row = await this.mercadoRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Mercado no encontrado');
    await this.masterUsage.assertCanDeactivateMercado(id);
    try {
      await this.mercadoRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este mercado porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  listMaterialCategories(includeInactive = false) {
    return this.materialCategoryRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createMaterialCategory(dto: CreateMaterialCategoryDto) {
    const codigo = dto.codigo.trim().toLowerCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.materialCategoryRepo, codigo, nombre);
    return this.materialCategoryRepo.save(
      this.materialCategoryRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updateMaterialCategory(id: number, dto: UpdateMaterialCategoryDto) {
    const row = await this.materialCategoryRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Categoría no encontrada');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateMaterialCategory(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toLowerCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.materialCategoryRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.materialCategoryRepo.save(row);
  }

  async deleteMaterialCategory(id: number) {
    const row = await this.materialCategoryRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Categoría no encontrada');
    await this.masterUsage.assertCanDeactivateMaterialCategory(id);
    try {
      await this.materialCategoryRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar esta categoría porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  listReceptionTypes(includeInactive = false) {
    return this.receptionTypeRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createReceptionType(dto: CreateReceptionTypeDto) {
    const codigo = dto.codigo.trim().toLowerCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.receptionTypeRepo, codigo, nombre);
    return this.receptionTypeRepo.save(
      this.receptionTypeRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updateReceptionType(id: number, dto: UpdateReceptionTypeDto) {
    const row = await this.receptionTypeRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Tipo de recepción no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateReceptionType(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toLowerCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.receptionTypeRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.receptionTypeRepo.save(row);
  }

  async deleteReceptionType(id: number) {
    const row = await this.receptionTypeRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Tipo de recepción no encontrado');
    await this.masterUsage.assertCanDeactivateReceptionType(id);
    try {
      await this.receptionTypeRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este tipo de recepción porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  listDocumentStates(includeInactive = false) {
    return this.documentStateRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async createDocumentState(dto: CreateDocumentStateDto) {
    const codigo = dto.codigo.trim().toLowerCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.documentStateRepo, codigo, nombre);
    return this.documentStateRepo.save(
      this.documentStateRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updateDocumentState(id: number, dto: UpdateDocumentStateDto) {
    const row = await this.documentStateRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Estado no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateDocumentState(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toLowerCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.documentStateRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.documentStateRepo.save(row);
  }

  async deleteDocumentState(id: number) {
    const row = await this.documentStateRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Estado no encontrado');
    await this.masterUsage.assertCanDeactivateDocumentState(id);
    try {
      await this.documentStateRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este estado de documento porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  /**
   * Lista marcas. Si `forClientId` está definido, devuelve marcas vinculadas a ese cliente en maestro
   * (`brands.client_id`) más marcas genéricas (`client_id` nulo).
   */
  listBrands(includeInactive = false, forClientId?: number) {
    const activeFilter = includeInactive ? {} : { activo: true };
    if (forClientId != null && forClientId > 0) {
      return this.brandRepo.find({
        where: [
          { ...activeFilter, client_id: forClientId },
          { ...activeFilter, client_id: IsNull() },
        ],
        relations: ['label_material', 'client'],
        order: { nombre: 'ASC' },
      });
    }
    return this.brandRepo.find({
      where: activeFilter,
      relations: ['label_material', 'client'],
      order: { nombre: 'ASC' },
    });
  }

  async createBrand(dto: CreateBrandDto) {
    if (dto.label_material_id != null) {
      const m = await this.materialRepo.findOne({ where: { id: dto.label_material_id } });
      if (!m) throw new BadRequestException('label_material_id inválido');
    }
    if (dto.client_id != null) {
      const c = await this.clientRepo.findOne({ where: { id: dto.client_id } });
      if (!c) throw new BadRequestException('client_id inválido');
    }
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.brandRepo, codigo, nombre);
    return this.brandRepo.save(
      this.brandRepo.create({
        codigo,
        nombre,
        label_material_id: dto.label_material_id ?? null,
        client_id: dto.client_id ?? null,
      }),
    );
  }

  async updateBrand(id: number, dto: UpdateBrandDto) {
    const row = await this.brandRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Marca no encontrada');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateBrand(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toUpperCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.brandRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.label_material_id !== undefined) {
      if (dto.label_material_id != null) {
        const m = await this.materialRepo.findOne({ where: { id: dto.label_material_id } });
        if (!m) throw new BadRequestException('label_material_id inválido');
      }
      row.label_material_id = dto.label_material_id ?? null;
    }
    if (dto.client_id !== undefined) {
      if (dto.client_id != null) {
        const c = await this.clientRepo.findOne({ where: { id: dto.client_id } });
        if (!c) throw new BadRequestException('client_id inválido');
      }
      row.client_id = dto.client_id ?? null;
    }
    if (dto.activo != null) row.activo = dto.activo;
    return this.brandRepo.save(row);
  }

  async deleteBrand(id: number) {
    const row = await this.brandRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Marca no encontrada');
    await this.masterUsage.assertCanDeactivateBrand(id);
    try {
      await this.brandRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar esta marca porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  listPackingSuppliers(includeInactive = false) {
    return this.packingSupplierRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async createPackingSupplier(dto: CreatePackingSupplierDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const nombre = dto.nombre.trim();
    await this.assertUniqueCodigoNombre(this.packingSupplierRepo, codigo, nombre);
    return this.packingSupplierRepo.save(
      this.packingSupplierRepo.create({
        codigo,
        nombre,
      }),
    );
  }

  async updatePackingSupplier(id: number, dto: UpdatePackingSupplierDto) {
    const row = await this.packingSupplierRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Proveedor no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivatePackingSupplier(id);
    }
    const nextCodigo = dto.codigo != null ? dto.codigo.trim().toUpperCase() : row.codigo;
    const nextNombre = dto.nombre != null ? dto.nombre.trim() : row.nombre;
    if (dto.codigo != null || dto.nombre != null) {
      await this.assertUniqueCodigoNombre(this.packingSupplierRepo, nextCodigo, nextNombre, id);
    }
    if (dto.codigo != null) row.codigo = nextCodigo;
    if (dto.nombre != null) row.nombre = nextNombre;
    if (dto.activo != null) row.activo = dto.activo;
    return this.packingSupplierRepo.save(row);
  }

  async deletePackingSupplier(id: number) {
    const row = await this.packingSupplierRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Proveedor no encontrado');
    await this.masterUsage.assertCanDeactivatePackingSupplier(id);
    try {
      await this.packingSupplierRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este proveedor porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  async linkMaterialSupplier(dto: LinkMaterialSupplierDto) {
    const m = await this.materialRepo.findOne({ where: { id: dto.material_id } });
    const s = await this.packingSupplierRepo.findOne({ where: { id: dto.supplier_id } });
    if (!m || !s) throw new BadRequestException('material_id o supplier_id inválido');
    let row = await this.pmsRepo.findOne({
      where: { material_id: dto.material_id, supplier_id: dto.supplier_id },
    });
    if (!row) {
      row = this.pmsRepo.create({
        material_id: dto.material_id,
        supplier_id: dto.supplier_id,
      });
    }
    if (dto.supplier_item_code !== undefined) {
      const c = dto.supplier_item_code?.trim();
      row.supplier_item_code = c ? c.slice(0, 80) : null;
    }
    if (dto.supplier_item_name !== undefined) {
      const n = dto.supplier_item_name?.trim();
      row.supplier_item_name = n ? n.slice(0, 300) : null;
    }
    await this.pmsRepo.save(row);
    return this.pmsRepo.findOne({
      where: { material_id: dto.material_id, supplier_id: dto.supplier_id },
      relations: ['supplier', 'material'],
    });
  }

  async updatePackingMaterialLink(dto: UpdatePackingMaterialLinkDto) {
    const row = await this.pmsRepo.findOne({
      where: { material_id: dto.material_id, supplier_id: dto.supplier_id },
    });
    if (!row) throw new NotFoundException('No existe vínculo material–proveedor.');
    if (dto.supplier_item_code !== undefined) {
      const c = dto.supplier_item_code?.trim();
      row.supplier_item_code = c ? c.slice(0, 80) : null;
    }
    if (dto.supplier_item_name !== undefined) {
      const n = dto.supplier_item_name?.trim();
      row.supplier_item_name = n ? n.slice(0, 300) : null;
    }
    await this.pmsRepo.save(row);
    return this.pmsRepo.findOne({
      where: { material_id: dto.material_id, supplier_id: dto.supplier_id },
      relations: ['supplier', 'material'],
    });
  }

  async unlinkMaterialSupplier(dto: LinkMaterialSupplierDto) {
    await this.pmsRepo.delete({
      material_id: dto.material_id,
      supplier_id: dto.supplier_id,
    });
    return { ok: true };
  }

  listMaterialSupplierLinks(materialId?: number) {
    if (materialId != null) {
      return this.pmsRepo.find({
        where: { material_id: materialId },
        relations: ['supplier', 'material'],
      });
    }
    return this.pmsRepo.find({ relations: ['supplier', 'material'] });
  }

  private async assertUniqueReturnableContainer(tipo: string, capacidad: string | null, excludeId?: number) {
    const t = tipo.trim();
    const capNorm = (capacidad?.trim() ?? '').toLowerCase();
    const qb = this.containerRepo
      .createQueryBuilder('r')
      .where('LOWER(TRIM(r.tipo)) = LOWER(TRIM(:t))', { t })
      .andWhere("COALESCE(LOWER(TRIM(r.capacidad)), '') = :cap", { cap: capNorm });
    if (excludeId != null) qb.andWhere('r.id != :id', { id: excludeId });
    if (await qb.getOne()) throw new BadRequestException('Ya existe otro envase con el mismo tipo y capacidad.');
  }

  listReturnableContainers(includeInactive = false) {
    return this.containerRepo.find({
      where: includeInactive ? {} : { activo: true },
      order: { tipo: 'ASC' },
    });
  }

  async createReturnableContainer(dto: CreateReturnableContainerDto) {
    const tipo = dto.tipo.trim();
    const capacidad = dto.capacidad?.trim() || null;
    await this.assertUniqueReturnableContainer(tipo, capacidad);
    return this.containerRepo.save(
      this.containerRepo.create({
        tipo,
        capacidad,
        requiereRetorno: dto.requiere_retorno ?? false,
      }),
    );
  }

  async updateReturnableContainer(id: number, dto: UpdateReturnableContainerDto) {
    const row = await this.containerRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Envase no encontrado');
    if (this.isDeactivating(row.activo, dto.activo)) {
      await this.masterUsage.assertCanDeactivateReturnableContainer(id);
    }
    const nextTipo = dto.tipo != null ? dto.tipo.trim() : row.tipo;
    const nextCap = dto.capacidad !== undefined ? dto.capacidad?.trim() || null : row.capacidad;
    if (dto.tipo != null || dto.capacidad !== undefined) {
      await this.assertUniqueReturnableContainer(nextTipo, nextCap, id);
    }
    if (dto.tipo != null) row.tipo = nextTipo;
    if (dto.capacidad !== undefined) row.capacidad = nextCap;
    if (dto.requiere_retorno != null) row.requiereRetorno = dto.requiere_retorno;
    if (dto.activo != null) row.activo = dto.activo;
    return this.containerRepo.save(row);
  }

  async deleteReturnableContainer(id: number) {
    const row = await this.containerRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Envase no encontrado');
    await this.masterUsage.assertCanDeactivateReturnableContainer(id);
    try {
      await this.containerRepo.delete({ id });
    } catch (e) {
      if (this.isPgForeignKeyViolation(e)) {
        throw new BadRequestException('No se puede borrar este envase porque está en uso.');
      }
      throw e;
    }
    return { ok: true };
  }

  listFinishedPtStock() {
    return this.ptStockRepo.find({
      relations: ['client', 'brand'],
      order: { format_code: 'ASC', id: 'ASC' },
    });
  }
}
