import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { WebhooksService } from './webhooks.service';
import type {
  CreateWebhookParsed,
  UpdateWebhookInput,
} from '@repo/shared/schemas';
import {
  CreateWebhookValidationPipe,
  UpdateWebhookValidationPipe,
} from './webhook-validation.pipe';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { WebhookDto, WebhookTestResultDto } from './webhooks.dto';

@Controller('projects/:key/webhooks')
@ProjectAuth()
@RequirePermission(Permission.WEBHOOK_MANAGE)
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope([WebhookDto])
  findAll(@ReqProject() project: Project) {
    return this.webhooksService.findAll(project.id);
  }

  @Get(':webhookId')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(WebhookDto)
  findOne(
    @ReqProject() project: Project,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooksService.findOne(project.id, webhookId);
  }

  @Post()
  @ApiEnvelope(WebhookDto, { status: HttpStatus.CREATED })
  create(
    @ReqProject() project: Project,
    @CurrentUser('id') userId: string,
    @Body(CreateWebhookValidationPipe) dto: CreateWebhookParsed,
  ) {
    return this.webhooksService.create(project.id, userId, dto);
  }

  @Patch(':webhookId')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(WebhookDto)
  update(
    @ReqProject() project: Project,
    @Param('webhookId') webhookId: string,
    @Body(UpdateWebhookValidationPipe) dto: UpdateWebhookInput,
  ) {
    return this.webhooksService.update(project.id, webhookId, dto);
  }

  @Delete(':webhookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ReqProject() project: Project,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooksService.remove(project.id, webhookId);
  }

  @Post(':webhookId/test')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(WebhookTestResultDto)
  test(
    @ReqProject() project: Project,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooksService.test(project.id, webhookId);
  }
}
