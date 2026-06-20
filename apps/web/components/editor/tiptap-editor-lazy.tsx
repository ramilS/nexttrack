'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { TiptapEditorProps } from './tiptap-editor';

// The Tiptap editor pulls in StarterKit, the mention/suggestion stack and
// lowlight (all syntax-highlight languages) — a large bundle that is only
// needed once a user actually edits. Load it on demand instead of eagerly in
// every issue view and comment box.
const TiptapEditorImpl = dynamic(
  () => import('./tiptap-editor').then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-24 w-full" />,
  },
);

export function TiptapEditor(props: TiptapEditorProps) {
  return <TiptapEditorImpl {...props} />;
}

export type { JSONContent } from './tiptap-editor';
