import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { GlobalRole } from '@prisma/client';
import { Permission } from '@repo/shared';
import { AttachmentsService } from './attachments.service';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '@/common/decorators/current-user.decorator';
import {
  ATTACHMENT_MAX_FILES_PER_UPLOAD,
  ATTACHMENT_MAX_FILE_SIZE,
} from '@repo/shared/schemas';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { SkipTimeout } from '@/common/interceptors/skip-timeout.decorator';
import { DownloadQueryDto, AttachmentDto } from './attachments.dto';

@Controller('issues/:issueId/attachments')
@IssueAuth()
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @Post()
  @RequirePermission(Permission.ISSUE_UPDATE)
  // Streaming multipart upload (to S3/MinIO) legitimately exceeds the global
  // JSON request timeout — exempt it so large files aren't aborted with a 408.
  @SkipTimeout()
  @ApiEnvelope([AttachmentDto], { status: HttpStatus.CREATED })
  @UseInterceptors(
    FilesInterceptor('files', ATTACHMENT_MAX_FILES_PER_UPLOAD, {
      limits: { fileSize: ATTACHMENT_MAX_FILE_SIZE },
    }),
  )
  async upload(
    @Param('issueId') issueId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.upload(
      issueId,
      files,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([AttachmentDto])
  async findAll(
    @Param('issueId') issueId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.findByIssue(
      issueId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Get(':attachmentId/download')
  @RequirePermission(Permission.ISSUE_READ)
  async download(
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() _query: DownloadQueryDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const url = await this.attachmentsService.getDownloadUrl(
      issueId,
      attachmentId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
    res.redirect(url);
  }

  @Get(':attachmentId/thumbnail')
  @RequirePermission(Permission.ISSUE_READ)
  async thumbnail(
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const url = await this.attachmentsService.getThumbnailUrl(
      issueId,
      attachmentId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
    res.redirect(url);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ISSUE_UPDATE)
  async softDelete(
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.attachmentsService.softDelete(
      issueId,
      attachmentId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
  }
}
