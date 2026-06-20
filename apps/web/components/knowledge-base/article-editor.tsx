'use client';

import { useState, useRef, useCallback } from 'react';
import { Loader2, Globe, Archive } from 'lucide-react';
import { TiptapEditor, type JSONContent } from '@/components/editor/tiptap-editor-lazy';
import { Button } from '@/components/ui/button';
import { useUpdateArticle, usePublishArticle, useArchiveArticle } from '@/lib/hooks/use-articles';
import type { Article } from '@/lib/api/articles.api';
import { RelativeTime } from '@/components/shared/relative-time';

interface ArticleEditorProps {
  projectKey: string;
  article: Article;
}

export function ArticleEditor({ projectKey, article }: ArticleEditorProps) {
  const updateArticle = useUpdateArticle(projectKey);
  const publishArticle = usePublishArticle(projectKey);
  const archiveArticle = useArchiveArticle(projectKey);

  const [title, setTitle] = useState(article.title);
  const [saving, setSaving] = useState(false);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      clearTimeout(titleTimeoutRef.current);
      setSaving(true);
      titleTimeoutRef.current = setTimeout(() => {
        updateArticle.mutate({ id: article.id, data: { title: newTitle } });
        setSaving(false);
      }, 1000);
    },
    [article.id, updateArticle],
  );

  const handleContentChange = useCallback(
    (json: JSONContent) => {
      clearTimeout(contentTimeoutRef.current);
      setSaving(true);
      contentTimeoutRef.current = setTimeout(() => {
        updateArticle.mutate({ id: article.id, data: { content: json } });
        setSaving(false);
      }, 1000);
    },
    [article.id, updateArticle],
  );

  const isPublished = !!article.publishedAt;
  const isArchived = !!article.archivedAt;

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Created by {article.createdBy.name}
          </span>
          <span>&middot;</span>
          <span>Updated <RelativeTime date={article.updatedAt} /></span>
          {saving && (
            <>
              <span>&middot;</span>
              <span className="flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Saving...
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => publishArticle.mutate(article.id)}
              disabled={publishArticle.isPending}
            >
              {publishArticle.isPending && <Loader2 className="size-3.5 animate-spin" />}
              <Globe className="size-3.5" />
              {isPublished ? 'Unpublish' : 'Publish'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => archiveArticle.mutate(article.id)}
            disabled={archiveArticle.isPending}
          >
            {archiveArticle.isPending && <Loader2 className="size-3.5 animate-spin" />}
            <Archive className="size-3.5" />
            Archive
          </Button>
        </div>
      </div>

      {/* Inline title */}
      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/50"
        placeholder="Untitled article"
      />

      {/* Body editor */}
      <TiptapEditor
        content={article.content ?? undefined}
        onChange={handleContentChange}
        placeholder="Start writing..."
      />
    </div>
  );
}
