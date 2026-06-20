export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/json',
  'application/xml',
  'video/mp4',
  'video/webm',
];

export const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi',
  '.dll', '.so', '.dylib', '.vbs', '.js', '.php',
];

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
