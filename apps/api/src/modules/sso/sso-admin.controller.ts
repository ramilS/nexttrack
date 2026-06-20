import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { SsoProvidersService } from './sso-providers.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiEnvelope,
  ApiPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateSsoProviderDto,
  UpdateSsoProviderDto,
  SsoConnectionsQueryDto,
  SsoProviderDto,
  SsoProviderConnectionDto,
} from './sso.dto';

@Controller('admin/sso/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.ADMIN)
export class SsoAdminController {
  constructor(private ssoProvidersService: SsoProvidersService) {}

  @Get()
  @ApiEnvelope([SsoProviderDto])
  findAll() {
    return this.ssoProvidersService.findAll();
  }

  @Post()
  @ApiEnvelope(SsoProviderDto, { status: HttpStatus.CREATED })
  create(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateSsoProviderDto,
  ) {
    return this.ssoProvidersService.create(adminId, dto);
  }

  @Get(':id')
  @ApiEnvelope(SsoProviderDto)
  findById(@Param('id') id: string) {
    return this.ssoProvidersService.findById(id);
  }

  @Patch(':id')
  @ApiEnvelope(SsoProviderDto)
  update(@Param('id') id: string, @Body() dto: UpdateSsoProviderDto) {
    return this.ssoProvidersService.update(id, dto);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(SsoProviderDto)
  enable(@Param('id') id: string) {
    return this.ssoProvidersService.enable(id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(SsoProviderDto)
  disable(@Param('id') id: string) {
    return this.ssoProvidersService.disable(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.ssoProvidersService.remove(id);
  }

  @Get(':id/connections')
  @ApiPaginated(SsoProviderConnectionDto)
  findConnections(
    @Param('id') id: string,
    @Query() query: SsoConnectionsQueryDto,
  ) {
    return this.ssoProvidersService.findConnections(id, query.page, query.perPage);
  }
}
