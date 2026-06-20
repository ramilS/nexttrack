'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { useUploadAttachments } from '@/lib/hooks/use-attachments';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import { cn } from '@/lib/utils';

interface AttachmentDropzoneProps {
  issueId: string;
  className?: string;
}

export function AttachmentDropzone({ issueId, className }: AttachmentDropzoneProps) {
  const canUpload = useHasPermission(Permission.ISSUE_UPDATE);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAttachments = useUploadAttachments(issueId);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) uploadAttachments.mutate(files);
    },
    [uploadAttachments],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) uploadAttachments.mutate(files);
      e.target.value = '';
    },
    [uploadAttachments],
  );

  if (!canUpload) return null;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors cursor-pointer',
        dragging && 'border-primary bg-primary/5',
        className,
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
    >
      {uploadAttachments.isPending ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground mb-2" />
      ) : (
        <Upload className="size-6 text-muted-foreground mb-2" />
      )}
      <p className="text-sm text-muted-foreground">
        {dragging ? 'Drop files here' : 'Drop files here or click to upload'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">Max 50MB per file</p>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
