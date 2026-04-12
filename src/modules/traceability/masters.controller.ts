import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePresentationFormatDto,
  CreateProcessResultComponentDto,
  CreateProcessMachineDto,
  CreateProducerDto,
  CreateQualityGradeDto,
  CreateSpeciesDto,
  CreateVarietyDto,
  UpdatePresentationFormatDto,
  UpdateProcessResultComponentDto,
  UpdateProcessMachineDto,
  UpdateProducerDto,
  UpdateQualityGradeDto,
  UpdateSpeciesDto,
  UpdateSpeciesProcessComponentsDto,
  UpdateVarietyDto,
} from './traceability.dto';
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
  UpdateBrandDto,
  UpdateClientDto,
  UpdateDocumentStateDto,
  UpdateMaterialCategoryDto,
  UpdateMercadoDto,
  UpdatePackingSupplierDto,
  UpdateReceptionTypeDto,
  UpdateReturnableContainerDto,
} from './operational.dto';
import { OperationalService } from './operational.service';
import { parseIncludeInactive } from './masters-query.util';
import { TraceabilityService } from './traceability.service';

@ApiTags('mantenedores / trazabilidad')
@ApiBearerAuth('JWT-auth')
@Controller('api/masters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MastersController {
  constructor(
    private readonly trace: TraceabilityService,
    private readonly operational: OperationalService,
  ) {}

  @Get('quality-grades')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listQuality(@Query('include_inactive') includeInactive?: string) {
    return this.trace.listQualityGrades(parseIncludeInactive(includeInactive));
  }

  @Post('quality-grades')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createQuality(@Body() dto: CreateQualityGradeDto) {
    return this.trace.createQualityGrade(dto);
  }

  @Put('quality-grades/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateQuality(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQualityGradeDto) {
    return this.trace.updateQualityGrade(id, dto);
  }

  @Get('species')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listSpecies(@Query('include_inactive') includeInactive?: string) {
    return this.trace.listSpecies(parseIncludeInactive(includeInactive));
  }

  @Post('species')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createSpecies(@Body() dto: CreateSpeciesDto) {
    return this.trace.createSpecies(dto);
  }

  @Put('species/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateSpecies(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSpeciesDto) {
    return this.trace.updateSpecies(id, dto);
  }

  @Get('producers')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listProducers(@Query('include_inactive') includeInactive?: string) {
    return this.trace.listProducers(parseIncludeInactive(includeInactive));
  }

  @Post('producers')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createProducer(@Body() dto: CreateProducerDto) {
    return this.trace.createProducer(dto);
  }

  @Put('producers/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateProducer(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProducerDto) {
    return this.trace.updateProducer(id, dto);
  }

  @Get('varieties')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listVarieties(@Query('species_id') speciesId?: string, @Query('include_inactive') includeInactive?: string) {
    let sid: number | undefined;
    if (speciesId != null && speciesId !== '') {
      const n = Number(speciesId);
      if (Number.isFinite(n)) sid = n;
    }
    return this.trace.listVarieties(sid, parseIncludeInactive(includeInactive));
  }

  @Post('varieties')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createVariety(@Body() dto: CreateVarietyDto) {
    return this.trace.createVariety(dto);
  }

  @Put('varieties/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateVariety(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVarietyDto) {
    return this.trace.updateVariety(id, dto);
  }

  @Get('presentation-formats')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listFormats(@Query('include_inactive') includeInactive?: string) {
    return this.trace.listPresentationFormats(parseIncludeInactive(includeInactive));
  }

  @Post('presentation-formats')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createFormat(@Body() dto: CreatePresentationFormatDto) {
    return this.trace.createPresentationFormat(dto);
  }

  @Put('presentation-formats/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateFormat(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePresentationFormatDto) {
    return this.trace.updatePresentationFormat(id, dto);
  }

  @Get('process-machines')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listProcessMachines(@Query('include_inactive') includeInactive?: string) {
    return this.trace.listProcessMachines(parseIncludeInactive(includeInactive));
  }

  @Post('process-machines')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createProcessMachine(@Body() dto: CreateProcessMachineDto) {
    return this.trace.createProcessMachine(dto);
  }

  @Put('process-machines/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateProcessMachine(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProcessMachineDto) {
    return this.trace.updateProcessMachine(id, dto);
  }

  @Get('process-result-components')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listProcessResultComponents(@Query('include_inactive') includeInactive?: string) {
    return this.trace.listProcessResultComponents(parseIncludeInactive(includeInactive));
  }

  @Post('process-result-components')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createProcessResultComponent(@Body() dto: CreateProcessResultComponentDto) {
    return this.trace.createProcessResultComponent(dto);
  }

  @Put('process-result-components/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateProcessResultComponent(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProcessResultComponentDto) {
    return this.trace.updateProcessResultComponent(id, dto);
  }

  @Get('species/:id/process-result-components')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listSpeciesProcessResultComponents(
    @Param('id', ParseIntPipe) id: number,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.trace.listSpeciesProcessResultComponents(id, parseIncludeInactive(includeInactive));
  }

  @Put('species/:id/process-result-components')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateSpeciesProcessResultComponents(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpeciesProcessComponentsDto,
  ) {
    return this.trace.updateSpeciesProcessResultComponents(id, dto);
  }

  @Get('clients')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listClients(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listClients(parseIncludeInactive(includeInactive));
  }

  @Post('clients')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createClient(@Body() dto: CreateClientDto) {
    return this.operational.createClient(dto);
  }

  @Put('clients/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateClient(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientDto) {
    return this.operational.updateClient(id, dto);
  }

  @Get('brands')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listBrands(
    @Query('include_inactive') includeInactive?: string,
    @Query('for_client_id') forClientIdRaw?: string,
  ) {
    let forClientId: number | undefined;
    if (forClientIdRaw != null && String(forClientIdRaw).trim() !== '') {
      const n = parseInt(String(forClientIdRaw), 10);
      if (!Number.isNaN(n) && n > 0) forClientId = n;
    }
    return this.operational.listBrands(parseIncludeInactive(includeInactive), forClientId);
  }

  @Post('brands')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createBrand(@Body() dto: CreateBrandDto) {
    return this.operational.createBrand(dto);
  }

  @Put('brands/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateBrand(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.operational.updateBrand(id, dto);
  }

  @Get('packing-suppliers')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listPackingSuppliers(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listPackingSuppliers(parseIncludeInactive(includeInactive));
  }

  @Post('packing-suppliers')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createPackingSupplier(@Body() dto: CreatePackingSupplierDto) {
    return this.operational.createPackingSupplier(dto);
  }

  @Put('packing-suppliers/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updatePackingSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePackingSupplierDto) {
    return this.operational.updatePackingSupplier(id, dto);
  }

  @Get('packing-material-links')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listPackingMaterialLinks(@Query('material_id') materialId?: string) {
    const mid =
      materialId != null && materialId !== '' && Number.isFinite(Number(materialId))
        ? Number(materialId)
        : undefined;
    return this.operational.listMaterialSupplierLinks(mid);
  }

  @Post('packing-material-links')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  linkPackingMaterial(@Body() dto: LinkMaterialSupplierDto) {
    return this.operational.linkMaterialSupplier(dto);
  }

  @Post('packing-material-links/unlink')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  unlinkPackingMaterial(@Body() dto: LinkMaterialSupplierDto) {
    return this.operational.unlinkMaterialSupplier(dto);
  }

  @Get('returnable-containers')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listReturnableContainers(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listReturnableContainers(parseIncludeInactive(includeInactive));
  }

  @Post('returnable-containers')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createReturnableContainer(@Body() dto: CreateReturnableContainerDto) {
    return this.operational.createReturnableContainer(dto);
  }

  @Put('returnable-containers/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateReturnableContainer(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReturnableContainerDto) {
    return this.operational.updateReturnableContainer(id, dto);
  }

  @Get('mercados')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listMercados(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listMercados(parseIncludeInactive(includeInactive));
  }

  @Post('mercados')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createMercado(@Body() dto: CreateMercadoDto) {
    return this.operational.createMercado(dto);
  }

  @Put('mercados/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateMercado(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMercadoDto) {
    return this.operational.updateMercado(id, dto);
  }

  @Get('material-categories')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listMaterialCategories(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listMaterialCategories(parseIncludeInactive(includeInactive));
  }

  @Post('material-categories')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createMaterialCategory(@Body() dto: CreateMaterialCategoryDto) {
    return this.operational.createMaterialCategory(dto);
  }

  @Put('material-categories/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateMaterialCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialCategoryDto) {
    return this.operational.updateMaterialCategory(id, dto);
  }

  @Get('reception-types')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listReceptionTypes(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listReceptionTypes(parseIncludeInactive(includeInactive));
  }

  @Post('reception-types')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createReceptionType(@Body() dto: CreateReceptionTypeDto) {
    return this.operational.createReceptionType(dto);
  }

  @Put('reception-types/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateReceptionType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReceptionTypeDto) {
    return this.operational.updateReceptionType(id, dto);
  }

  @Get('document-states')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listDocumentStates(@Query('include_inactive') includeInactive?: string) {
    return this.operational.listDocumentStates(parseIncludeInactive(includeInactive));
  }

  @Post('document-states')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  createDocumentState(@Body() dto: CreateDocumentStateDto) {
    return this.operational.createDocumentState(dto);
  }

  @Put('document-states/:id')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  updateDocumentState(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDocumentStateDto) {
    return this.operational.updateDocumentState(id, dto);
  }

  @Get('finished-pt-stock')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listFinishedPtStock() {
    return this.operational.listFinishedPtStock();
  }
}
