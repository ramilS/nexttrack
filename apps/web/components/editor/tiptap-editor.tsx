'use client';

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { common, createLowlight } from 'lowlight';
import { ReactRenderer } from '@tiptap/react';
import { EditorToolbar } from './editor-toolbar';
import { MentionList, type MentionListRef } from './mention-list';
import { cn } from '@/lib/utils';
import { useRef, useCallback, useEffect, useMemo } from 'react';

const lowlight = createLowlight(common);

/** Mention extension configured for read-only rendering (no suggestion/autocomplete) */
const mentionReadOnly = Mention.configure({
  HTMLAttributes: { class: 'text-primary font-medium' },
});

interface MentionUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface TiptapEditorProps {
  content?: JSONContent | string;
  onChange?: (json: JSONContent) => void;
  onSubmit?: () => void;
  placeholder?: string;
  editable?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
  mentionUsers?: MentionUser[];
  minimal?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function TiptapEditor({
  content,
  onChange,
  onSubmit,
  placeholder = 'Write something...',
  editable = true,
  onImageUpload,
  mentionUsers,
  minimal = false,
  className,
  autoFocus = false,
}: TiptapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;

  const hasMentions = !!mentionUsers;
  const mentionExtension = useMemo(() => {
    if (!hasMentions) return mentionReadOnly;
    return Mention.configure({
      HTMLAttributes: { class: 'text-primary font-medium' },
      suggestion: {
        items: ({ query }: { query: string }) => {
          const users = mentionUsersRef.current ?? [];
          return users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
        },
        render: () => {
          let component: ReactRenderer<MentionListRef> | null = null;
          let container: HTMLDivElement | null = null;

          /* eslint-disable react/prop-types -- tiptap suggestion callback props */
          return {
            onStart: (props: SuggestionProps) => {
              container = document.createElement('div');
              container.style.position = 'absolute';
              container.style.zIndex = '50';
              document.body.appendChild(container);

              component = new ReactRenderer(MentionList, { props, editor: props.editor });
              container.appendChild(component.element);

              if (props.clientRect) {
                const rect = props.clientRect();
                if (rect) {
                  container.style.left = `${rect.left}px`;
                  container.style.top = `${rect.bottom + 4}px`;
                }
              }
            },
            onUpdate: (props: SuggestionProps) => {
              component?.updateProps(props);
              if (props.clientRect && container) {
                const rect = props.clientRect();
                if (rect) {
                  container.style.left = `${rect.left}px`;
                  container.style.top = `${rect.bottom + 4}px`;
                }
              }
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                container?.remove();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              component?.destroy();
              container?.remove();
            },
          };
        },
      },
    });
  }, [hasMentions]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-2',
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-md max-w-full',
        },
      }),
      mentionExtension,
    ],
    content: content ?? '',
    editable,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none px-3 py-2',
          '[--tw-prose-body:var(--foreground)] [--tw-prose-headings:var(--foreground)]',
          '[--tw-prose-bold:var(--foreground)] [--tw-prose-quotes:var(--foreground)]',
          '[--tw-prose-code:var(--foreground)] [--tw-prose-bullets:var(--muted-foreground)]',
          '[--tw-prose-counters:var(--muted-foreground)] [--tw-prose-links:var(--primary)]',
          editable && !minimal && 'min-h-50',
          editable && minimal && 'min-h-20',
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (!onImageUpload) return false;
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'));
        if (!imageFile) return false;

        event.preventDefault();
        onImageUpload(imageFile).then((url) => {
          editor?.chain().focus().setImage({ src: url }).run();
        });
        return true;
      },
      handlePaste: (_view, event) => {
        if (!onImageUpload) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;

        const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
        if (!imageItem) return false;

        const file = imageItem.getAsFile();
        if (!file) return false;

        event.preventDefault();
        onImageUpload(file).then((url) => {
          editor?.chain().focus().setImage({ src: url }).run();
        });
        return true;
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      if (!transaction.docChanged) return;
      onChange?.(e.getJSON());
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  const handleImageUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onImageUpload || !editor) return;
      const url = await onImageUpload(file);
      editor.chain().focus().setImage({ src: url }).run();
      e.target.value = '';
    },
    [editor, onImageUpload],
  );

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        editable && 'border border-input',
        className,
      )}
    >
      {editable && (
        <EditorToolbar
          editor={editor}
          minimal={minimal}
          onImageUpload={onImageUpload ? handleImageUploadClick : undefined}
        />
      )}
      <EditorContent editor={editor} />
      {onImageUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}
    </div>
  );
}

export { type JSONContent };
