import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AttachmentsStorageService } from './attachments-storage.service';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { AttachmentsRepository, buildAttachmentDto } from './attachments.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { storageConfig } from '@/config';
import { ErrorCode } from '@repo/shared/error-codes';
import type { Attachment } from '@repo/shared/schemas';
import {
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  formatFileSize,
} from './attachment-limits';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private attachmentsRepo: AttachmentsRepository,
    private issuesRepo: IssuesReader,
    private projectMembersRepo: ProjectMembersRepository,
    private storage: AttachmentsStorageService,
    private activitiesService: ActivitiesService,
    @Inject(storageConfig.KEY)
    private config: ConfigType<typeof storageConfig>,
  ) {}

  async upload(issueId: string, files: UploadedFile[], userId: string, isAdmin = false): Promise<Attachment[]> {
    const issueProjectId = await this.issuesRepo.findProjectIdById(issueId);
    if (!issueProjectId) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    const existingCount = await this.attachmentsRepo.countActiveByIssue(issueId);
    if (existingCount + files.length > this.config.maxTotalPerIssue) {
      throw new ValidationError(
        ErrorCode.ATTACHMENT_LIMIT_REACHED,
        `Maximum ${this.config.maxTotalPerIssue} attachments per issue`,
      );
    }

    const results: Attachment[] = [];

    for (const file of files) {
      this.validateFile(file);

      const ext = extname(file.originalname).toLowerCase();
      const attachmentId = randomUUID();
      const storagePath = `attachments/${issueId}/${attachmentId}${ext}`;

      await this.storage.uploadBuffer(file.buffer, storagePath, file.mimetype);

      const raw = await this.attachmentsRepo.create({
        id: attachmentId,
        issueId,
        uploadedById: userId,
        filename: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        size: file.size,
      });

      await this.activitiesService.recordOne(
        issueId,
        userId,
        ActivityType.ATTACHMENT_ADD,
        { attachmentId: raw.id, filename: file.originalname },
      );

      results.push(buildAttachmentDto(raw, userId, isAdmin));
    }

    return results;
  }

  async findByIssue(issueId: string, userId: string, isAdmin = false): Promise<Attachment[]> {
    const raws = await this.attachmentsRepo.findActiveByIssue(issueId);
    return raws.map((r) => buildAttachmentDto(r, userId, isAdmin));
  }

  async getDownloadUrl(attachmentId: string, userId: string): Promise<string> {
    const raw = await this.findAttachmentWithAccessCheck(attachmentId, userId);
    return this.storage.getPresignedUrl(raw.storagePath, {
      downloadFilename: raw.filename,
    });
  }

  async getThumbnailUrl(attachmentId: string, userId: string): Promise<string> {
    const raw = await this.findAttachmentWithAccessCheck(attachmentId, userId);
    if (!raw.thumbnailPath) {
      throw new NotFoundError(ErrorCode.ATTACHMENT_THUMBNAIL_NOT_AVAILABLE);
    }
    return this.storage.getPresignedUrl(raw.thumbnailPath);
  }

  async softDelete(
    attachmentId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    const raw = await this.attachmentsRepo.findActiveById(attachmentId);
    if (!raw) {
      throw new NotFoundError(ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    if (raw.uploadedById !== userId && !isAdmin) {
      throw new PermissionDeniedError(ErrorCode.FORBIDDEN);
    }

    await this.attachmentsRepo.softDelete(attachmentId, userId);

    await this.activitiesService.recordOne(
      raw.issueId,
      userId,
      ActivityType.ATTACHMENT_DELETE,
      { attachmentId, filename: raw.filename },
    );

    void this.storage.deleteFile(raw.storagePath).catch((err) =>
      this.logger.warn(`Failed to delete file ${raw.storagePath}: ${err.message}`),
    );
    if (raw.thumbnailPath) {
      void this.storage.deleteFile(raw.thumbnailPath).catch((err) =>
        this.logger.warn(`Failed to delete thumbnail ${raw.thumbnailPath}: ${err.message}`),
      );
    }
  }

  private async findAttachmentWithAccessCheck(attachmentId: string, userId: string) {
    const raw = await this.attachmentsRepo.findActiveById(attachmentId);
    if (!raw) {
      throw new NotFoundError(ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    const projectId = await this.attachmentsRepo.findIssueProjectId(attachmentId);
    if (!projectId) {
      throw new NotFoundError(ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    const isMember = await this.projectMembersRepo.isMember(userId, projectId);
    if (!isMember) {
      throw new PermissionDeniedError(ErrorCode.FORBIDDEN);
    }

    return raw;
  }

  private validateFile(file: UploadedFile) {
    if (file.size > this.config.maxFileSizeBytes) {
      throw new ValidationError(
        ErrorCode.ATTACHMENT_TOO_LARGE,
        `File "${file.originalname}" exceeds maximum size of ${formatFileSize(this.config.maxFileSizeBytes)}`,
      );
    }

    const ext = extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new ValidationError(
        ErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED,
        `File type "${ext}" is not allowed`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new ValidationError(
        ErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED,
        `MIME type "${file.mimetype}" is not allowed`,
      );
    }
  }
}
