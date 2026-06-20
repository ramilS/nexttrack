'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateArticle } from '@/lib/hooks/use-articles';

interface CreateArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  parentId?: string;
  onCreated?: (slug: string) => void;
}

export function CreateArticleDialog({
  open,
  onOpenChange,
  projectKey,
  parentId,
  onCreated,
}: CreateArticleDialogProps) {
  const [title, setTitle] = useState('');
  const createArticle = useCreateArticle(projectKey);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    createArticle.mutate(
      {
        title: title.trim(),
        parentId,
      },
      {
        onSuccess: (response) => {
          handleClose();
          onCreated?.(response.data.slug);
        },
      },
    );
  }

  function handleClose() {
    setTitle('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parentId ? 'Add Child Article' : 'New Article'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="article-title">Title</Label>
            <Input
              id="article-title"
              placeholder="e.g. Getting Started"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || createArticle.isPending}>
              {createArticle.isPending && <Loader2 className="size-4 animate-spin" />}
              Create Article
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
