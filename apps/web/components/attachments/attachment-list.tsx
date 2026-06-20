'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { Paperclip, X } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Separator } from '@/components/ui/separator';
import { AttachmentCard } from './attachment-card';
import { AttachmentDropzone } from './attachment-dropzone';
import { useAttachments } from '@/lib/hooks/use-attachments';
import type { Attachment } from '@/lib/api/attachments.api';
import { resolveApiUrl } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface AttachmentListProps {
  issueId: string;
  className?: string;
  readOnly?: boolean;
}

export function AttachmentList({ issueId, className, readOnly }: AttachmentListProps) {
  const { data: attachments, isLoading } = useAttachments(issueId);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const isEmpty = !attachments || attachments.length === 0;
  if (readOnly && isEmpty && !isLoading) return null;

  return (
    <>
    <Separator />
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">
          Attachments {attachments ? `(${attachments.length})` : ''}
        </h3>
      </div>

      <AsyncContent loading={isLoading} className="py-4" spinnerClassName="size-4">
        {attachments && attachments.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                issueId={issueId}
                onPreview={setPreviewAttachment}
              />
            ))}
          </div>
        )}
      </AsyncContent>

      {!readOnly && <AttachmentDropzone issueId={issueId} />}

    </div>
      {/* Image lightbox */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewAttachment(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setPreviewAttachment(null)}
          >
            <X className="size-6" />
          </button>
          <NextImage
            src={resolveApiUrl(previewAttachment.downloadUrl)}
            alt={previewAttachment.filename}
            width={1200}
            height={900}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
            unoptimized
          />
        </div>
      )}
    </>
  );
}
