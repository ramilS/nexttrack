import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Permission } from '@repo/shared';
import { CustomFieldValuesService } from './custom-field-values.service';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { SetFieldValueDto, CustomFieldValueDto } from './custom-fields.dto';

@Controller('issues/:issueId/fields')
@IssueAuth()
export class FieldValuesController {
  constructor(
    private customFieldValuesService: CustomFieldValuesService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([CustomFieldValueDto])
  async getFields(@Param('issueId') issueId: string) {
    const projectId = await this.customFieldValuesService.resolveIssueProject(issueId);
    return this.customFieldValuesService.getFieldsForIssue(issueId, projectId);
  }

  @Patch(':fieldId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_UPDATE)
  @ApiEnvelope(CustomFieldValueDto)
  async setFieldValue(
    @Param('issueId') issueId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: SetFieldValueDto,
    @CurrentUser('id') userId: string,
  ) {
    const projectId = await this.customFieldValuesService.resolveIssueProject(issueId);
    return this.customFieldValuesService.setFieldValue(
      issueId,
      fieldId,
      dto.value,
      userId,
      projectId,
    );
  }

  @Delete(':fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ISSUE_UPDATE)
  async clearFieldValue(
    @Param('issueId') issueId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser('id') userId: string,
  ) {
    const projectId = await this.customFieldValuesService.resolveIssueProject(issueId);
    await this.customFieldValuesService.clearFieldValue(
      issueId,
      fieldId,
      userId,
      projectId,
    );
  }
}
