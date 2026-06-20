'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { FileText, Image as ImageIcon, FileSpreadsheet, FileArchive, File, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeleteAttachment } from '@/lib/hooks/use-attachments';
import { resolveApiUrl } from '@/lib/api/client';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import type { Attachment } from '@/lib/api/attachments.api';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface AttachmentCardProps {
  attachment: Attachment;
  issueId: string;
  onPreview?: (attachment: Attachment) => void;
  className?: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return FileSpreadsheet;
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('tar')) return FileArchive;
  return File;
}

export function AttachmentCard({ attachment, issueId, onPreview, className }: AttachmentCardProps) {
  const canDelete = useHasPermission(Permission.ISSUE_UPDATE);
  const deleteAttachment = useDeleteAttachment(issueId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const Icon = getFileIcon(attachment.mimeType);

  function handleDownload() {
    window.open(resolveApiUrl(attachment.downloadUrl), '_blank');
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteOpen(true);
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors cursor-pointer',
        className,
      )}
      onClick={() => {
        if (attachment.isImage && onPreview) onPreview(attachment);
        else handleDownload();
      }}
    >
      {/* Thumbnail or icon */}
      <div className="flex size-16 items-center justify-center rounded-md bg-muted mb-2">
        {attachment.hasThumbnail && attachment.thumbnailUrl ? (
          <NextImage
            src={resolveApiUrl(attachment.thumbnailUrl)}
            alt={attachment.filename}
            width={64}
            height={64}
            className="size-16 rounded-md object-cover"
            unoptimized
          />
        ) : (
          <Icon className="size-6 text-muted-foreground" />
        )}
      </div>

      <span className="text-xs font-medium truncate max-w-full">{attachment.filename}</span>
      <span className="text-[10px] text-muted-foreground">{attachment.sizeFormatted}</span>

      {/* Actions overlay */}
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="icon-xs"
          className="size-5"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
        >
          <Download className="size-3" />
        </Button>
        {canDelete && attachment.canDelete && (
          <Button
            variant="secondary"
            size="icon-xs"
            className="size-5 text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${attachment.filename}`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteAttachment.mutate(attachment.id)}
      />
    </div>
  );
}
