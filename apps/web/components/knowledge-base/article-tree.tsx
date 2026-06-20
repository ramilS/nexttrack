'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AsyncContent } from '@/components/shared/async-content';
import { useArticleTree, useDeleteArticle } from '@/lib/hooks/use-articles';
import { ArticleTreeItem } from './article-tree-item';
import { CreateArticleDialog } from './create-article-dialog';

interface ArticleTreeProps {
  projectKey: string;
  selectedSlug?: string;
  onSelect: (slug: string) => void;
}

export function ArticleTree({ projectKey, selectedSlug, onSelect }: ArticleTreeProps) {
  const { data: tree, isLoading } = useArticleTree(projectKey);
  const deleteArticle = useDeleteArticle(projectKey);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parentId, setParentId] = useState<string | undefined>();

  function handleCreateChild(pid: string) {
    setParentId(pid);
    setDialogOpen(true);
  }

  function handleNewArticle() {
    setParentId(undefined);
    setDialogOpen(true);
  }

  function handleDelete(id: string) {
    deleteArticle.mutate(id);
  }

  if (isLoading) {
    return <AsyncContent loading>{null}</AsyncContent>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Articles
        </span>
        <Button variant="ghost" size="icon" className="size-6" aria-label="New article" onClick={handleNewArticle}>
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {!tree || tree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No articles yet
          </p>
        ) : (
          tree.map((node) => (
            <ArticleTreeItem
              key={node.id}
              node={node}
              projectKey={projectKey}
              selectedSlug={selectedSlug}
              depth={0}
              onSelect={onSelect}
              onCreateChild={handleCreateChild}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <CreateArticleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectKey={projectKey}
        parentId={parentId}
        onCreated={(slug) => onSelect(slug)}
      />
    </div>
  );
}
