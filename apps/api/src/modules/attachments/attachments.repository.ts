import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { isImageMimeType, formatFileSize } from './attachment-limits';
import type { Tx } from '@/common/repository/tx.types';
import type { Attachment } from '@repo/shared/schemas';

export interface AttachmentCreateInput {
  id: string;
  issueId: string;
  uploadedById: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  size: number;
}

/**
 * "Raw" attachment record — service decorates with `canDelete` (auth-derived).
 */
export interface RawAttachment {
  id: string;
  issueId: string;
  uploadedById: string;
  uploadedBy: { id: string; name: string; email: string; avatarUrl: string | null };
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  thumbnailPath: string | null;
  createdAt: string;
}

const UPLOADER_SELECT = {
  select: { id: true, name: true, email: true, avatarUrl: true },
} as const;

type AttachmentRow = {
  id: string;
  issueId: string;
  uploadedById: string;
  uploadedBy: { id: string; name: string; email: string; avatarUrl: string | null };
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  thumbnailPath: string | null;
  createdAt: Date;
};

function toRaw(row: AttachmentRow): RawAttachment {
  return {
    id: row.id,
    issueId: row.issueId,
    uploadedById: row.uploadedById,
    uploadedBy: row.uploadedBy,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    storagePath: row.storagePath,
    thumbnailPath: row.thumbnailPath,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Builds the public `Attachment` DTO from a `RawAttachment` and the
 * current user's identity / role.
 */
export function buildAttachmentDto(
  raw: RawAttachment,
  currentUserId: string,
  isAdmin: boolean,
): Attachment {
  return {
    id: raw.id,
    issueId: raw.issueId,
    uploadedBy: raw.uploadedBy,
    filename: raw.filename,
    mimeType: raw.mimeType,
    size: raw.size,
    sizeFormatted: formatFileSize(raw.size),
    isImage: isImageMimeType(raw.mimeType),
    hasThumbnail: raw.thumbnailPath !== null,
    downloadUrl: `/issues/${raw.issueId}/attachments/${raw.id}/download`,
    thumbnailUrl: raw.thumbnailPath
      ? `/issues/${raw.issueId}/attachments/${raw.id}/thumbnail`
      : null,
    createdAt: raw.createdAt,
    canDelete: raw.uploadedById === currentUserId || isAdmin,
  };
}

@Injectable()
export class AttachmentsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async countActiveByIssue(issueId: string): Promise<number> {
    return this.prisma.attachment.count({
      where: { issueId, deletedAt: null },
    });
  }

  async findActiveByIssue(issueId: string): Promise<RawAttachment[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { issueId, deletedAt: null },
      include: { uploadedBy: UPLOADER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRaw);
  }

  async findActiveById(attachmentId: string): Promise<RawAttachment | null> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      include: { uploadedBy: UPLOADER_SELECT },
    });
    return row ? toRaw(row) : null;
  }

  /**
   * Returns the projectId of the issue this attachment belongs to,
   * or `null` if the attachment is missing/deleted. Used for access checks.
   */
  async findIssueProjectId(attachmentId: string): Promise<string | null> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      select: { issue: { select: { projectId: true } } },
    });
    return row?.issue.projectId ?? null;
  }

  async create(input: AttachmentCreateInput, tx?: Tx): Promise<RawAttachment> {
    const row = await this.db(tx).attachment.create({
      data: input,
      include: { uploadedBy: UPLOADER_SELECT },
    });
    return toRaw(row);
  }

  async softDelete(attachmentId: string, deletedById: string, tx?: Tx): Promise<void> {
    await this.db(tx).attachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date(), deletedById },
    });
  }
}
