import { Body, Controller, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddPtTagItemDto, CreateFruitProcessDto, CreatePtTagDto, UpdatePtTagDto } from './process.dto';
import { ProcessService } from './process.service';

@ApiTags('proceso / tarjas')
@ApiBearerAuth('JWT-auth')
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Post('processes')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  createProcess(@Body() dto: CreateFruitProcessDto) {
    return this.service.createProcess(dto);
  }

  @Post('pt-tags')
  @Roles(ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN)
  createTag(@Body() dto: CreatePtTagDto) {
    return this.service.createTag(dto);
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
