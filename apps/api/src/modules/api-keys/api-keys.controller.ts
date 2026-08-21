import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Project } from '@prisma/client';
import { Permission } from '@repo/shared';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ReqProject } from '@/common/decorators/project.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyRow } from './api-keys.repository';
import { ApiKeyDto, CreateApiKeyDto, IssuedApiKeyDto } from './api-keys.dto';

@Controller('projects/:key/api-keys')
@ProjectAuth()
@RequirePermission(Permission.PROJECT_SETTINGS_UPDATE)
export class ApiKeysController {
  constructor(private apiKeys: ApiKeysService) {}

  @Get()
  @ApiEnvelope([ApiKeyDto])
  async findAll(@ReqProject() project: Project) {
    const keys = await this.apiKeys.list(project.id);
    return keys.map((key) => this.toDto(key));
  }

  @Post()
  @ApiEnvelope(IssuedApiKeyDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser('id') userId: string,
  ) {
    const { key, raw } = await this.apiKeys.issue(
      project.id,
      { name: dto.name, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
      userId,
    );
    return { ...this.toDto(key), raw };
  }

  @Delete(':keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@ReqProject() project: Project, @Param('keyId') keyId: string) {
    await this.apiKeys.revoke(project.id, keyId);
  }

  /** Never exposes tokenHash or userId — the secret and the principal stay internal. */
  private toDto(key: ApiKeyRow): ApiKeyDto {
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    };
  }
}
