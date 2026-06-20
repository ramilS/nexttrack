'use client';

import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface UploadItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface UploadProgressProps {
  uploads: UploadItem[];
  className?: string;
}

export function UploadProgress({ uploads, className }: UploadProgressProps) {
  if (uploads.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {uploads.map((upload, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
          <div className="shrink-0">
            {upload.status === 'uploading' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {upload.status === 'done' && <CheckCircle className="size-4 text-success" />}
            {upload.status === 'error' && <AlertCircle className="size-4 text-destructive" />}
            {upload.status === 'pending' && <Loader2 className="size-4 text-muted-foreground" />}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs truncate">{upload.file.name}</p>
            {upload.status === 'uploading' && (
              <Progress value={upload.progress} className="h-1" />
            )}
          </div>

          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatSize(upload.file.size)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
