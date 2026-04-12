import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AddPtTagItemDto,
  CloseProcessBalanceDto,
  CreateFruitProcessDto,
  CreatePtTagDto,
  MergeTagsDto,
  SplitTagDto,
  UpdatePtTagDto,
  UpdateProcessWeightsDto,
  SetProcessStatusDto,
} from './process.dto';
import { ProcessService } from './process.service';

type JwtRequest = Request & { user: { role: string } };

@ApiTags('proceso / unidades PT')
@ApiBearerAuth('JWT-auth')
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Get('processes')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listProcesses() {
    return this.service.listProcesses();
  }

  @Post('processes')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  createProcess(@Body() dto: CreateFruitProcessDto) {
    return this.service.createProcess(dto);
  }

  @Get('processes/eligible-lines')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  eligibleLines(@Query('producer_id', ParseIntPipe) producerId: number) {
    return this.service.listEligibleMpLinesForProducer(producerId);
  }

  @Get('processes/producers-with-eligible-mp')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  producersWithEligibleMp() {
    return this.service.listProducerIdsWithEligibleMp();
  }

  @Patch('processes/:id/weights')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  updateWeights(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProcessWeightsDto,
    @Req() req: JwtRequest,
  ) {
    const allowClosedIfAdmin = req.user?.role === 'admin';
    return this.service.updateProcessWeights(id, dto, { allowClosedIfAdmin });
  }

  @Put('processes/:id/balance')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  closeBalance(@Param('id', ParseIntPipe) id: number, @Body() dto: CloseProcessBalanceDto) {
    return this.service.closeProcessBalance(id, dto);
  }

  @Post('processes/:id/confirm')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  confirmProcess(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirmProcess(id);
  }

  @Patch('processes/:id/status')
  @Roles(ROLES.SUPERVISOR, ROLES.ADMIN)
  setProcessStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetProcessStatusDto,
    @Req() req: JwtRequest,
  ) {
    if (dto.status === 'cerrado') {
      return this.service.setProcessStatus(id, { status: 'cerrado' });
    }
    const role = req.user?.role;
    if (role === 'admin') {
      return this.service.adminSetProcessStatus(id, dto);
    }
    /** Supervisor: reabrir a borrador (desvincula unidad PT si aplica) para poder asignar otra tarja. */
    if (role === 'supervisor' && dto.status === 'borrador') {
      return this.service.adminSetProcessStatus(id, dto);
    }
    if (role === 'supervisor') {
      throw new ForbiddenException(
        'Como supervisor solo podés reabrir a borrador (o cerrar). Para confirmar usá «Confirmar proceso».',
      );
    }
    throw new ForbiddenException('Solo administrador puede fijar este estado');
  }

  @Get('pt-tags')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  listPtTags() {
    return this.service.listPtTagsWithItems();
  }

  @Post('pt-tags')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  createTag(@Body() dto: CreatePtTagDto) {
    return this.service.createTag(dto);
  }

  @Post('pt-tags/merge')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  mergeTags(@Body() dto: MergeTagsDto) {
    return this.service.mergeTags(dto);
  }

  @Post('pt-tags/:id/split')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  splitTag(@Param('id', ParseIntPipe) id: number, @Body() dto: SplitTagDto) {
    return this.service.splitTag(id, dto);
  }

  @Get('pt-tags/:id/lineage')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  tagLineage(@Param('id', ParseIntPipe) id: number) {
    return this.service.getTagLineage(id);
  }

  @Post('pt-tags/:id/items')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  addToTag(@Param('id', ParseIntPipe) id: number, @Body() dto: AddPtTagItemDto) {
    return this.service.addProcessToTag(id, dto);
  }

  @Put('pt-tags/:id')
  @Roles(ROLES.ADMIN, ROLES.SUPERVISOR)
  updateTag(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePtTagDto) {
    return this.service.updateTag(id, dto);
  }
}
