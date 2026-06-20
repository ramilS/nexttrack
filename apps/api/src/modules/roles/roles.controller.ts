import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesService } from './roles.service';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { CreateRoleDto, UpdateRoleDto, RoleDto } from './roles.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.ADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiEnvelope([RoleDto])
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiEnvelope(RoleDto)
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @ApiEnvelope(RoleDto, { status: HttpStatus.CREATED })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @ApiEnvelope(RoleDto)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
