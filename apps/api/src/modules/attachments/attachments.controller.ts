import {
  Controller,
  Inject,
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
import { ConfigType } from '@nestjs/config';
import { ServerResponse } from 'http';
import { pipeline } from 'stream/promises';
import { GlobalRole } from '@prisma/client';
import { Permission } from '@repo/shared';
import { AttachmentsService, type AttachmentContent } from './attachments.service';
import { buildAttachmentDisposition } from './content-disposition';
import { storageConfig } from '@/config';
import { AppLogger } from '@/common/logging/app-logger';
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

// User-uploaded bytes are served from the app's own origin, so a file must never
// run as a document here — not even one whose stored type a browser would render.
const ATTACHMENT_CSP = "sandbox; default-src 'none'";
// Browsers cancel image loads on every navigation; that is not an incident.
const CLIENT_WENT_AWAY = 'ERR_STREAM_PREMATURE_CLOSE';

@Controller('issues/:issueId/attachments')
@IssueAuth()
export class AttachmentsController {
  private readonly logger = new AppLogger(AttachmentsController.name);

  constructor(
    private attachmentsService: AttachmentsService,
    @Inject(storageConfig.KEY)
    private storage: ConfigType<typeof storageConfig>,
  ) {}

  @Post()
  @RequirePermission(Permission.ISSUE_UPDATE)
  // Streaming multipart upload (to S3) legitimately exceeds the global
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
  @SkipTimeout()
  async download(
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() _query: DownloadQueryDto,
    @CurrentUser() user: RequestUser,
    @Res() res: ServerResponse,
  ) {
    const content = await this.attachmentsService.openDownload(
      issueId,
      attachmentId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
    await this.streamAttachment(res, content, attachmentId);
  }

  @Get(':attachmentId/thumbnail')
  @RequirePermission(Permission.ISSUE_READ)
  @SkipTimeout()
  async thumbnail(
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: ServerResponse,
  ) {
    const content = await this.attachmentsService.openThumbnail(
      issueId,
      attachmentId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
    await this.streamAttachment(res, content, attachmentId);
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

  private async streamAttachment(
    res: ServerResponse,
    content: AttachmentContent,
    attachmentId: string,
  ): Promise<void> {
    res.setHeader('Content-Type', content.contentType);
    res.setHeader('Cache-Control', `private, max-age=${this.storage.cacheMaxAgeSeconds}`);
    res.setHeader('Content-Security-Policy', ATTACHMENT_CSP);
    if (content.contentLength !== undefined) {
      res.setHeader('Content-Length', content.contentLength);
    }
    if (content.downloadFilename !== undefined) {
      res.setHeader('Content-Disposition', buildAttachmentDisposition(content.downloadFilename));
    }

    try {
      await pipeline(content.body, res);
    } catch (err) {
      // The response may already be partly sent and pipeline has destroyed it,
      // so the exception filter cannot answer; the client sees a failed transfer.
      const code = err instanceof Error && 'code' in err ? err.code : undefined;
      if (code === CLIENT_WENT_AWAY) {
        this.logger.debug('Attachment stream closed by the client', { attachmentId });
        return;
      }
      this.logger.warn('Attachment stream interrupted', { attachmentId, code });
    }
  }
}
