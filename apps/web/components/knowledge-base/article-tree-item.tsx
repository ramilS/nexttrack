'use client';

import { useState } from 'react';
import { ChevronRight, Plus, Trash2, FileText, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArticleTreeNode } from '@/lib/api/articles.api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ArticleTreeItemProps {
  node: ArticleTreeNode;
  projectKey: string;
  selectedSlug?: string;
  depth: number;
  onSelect: (slug: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}

export function ArticleTreeItem({
  node,
  projectKey,
  selectedSlug,
  depth,
  onSelect,
  onCreateChild,
  onDelete,
}: ArticleTreeItemProps) {
  const [expanded, setExpanded] = useState(node.slug === selectedSlug || false);
  const hasChildren = node.children.length > 0;
  const isActive = node.slug === selectedSlug;
  const isDraft = !node.publishedAt;

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          className="flex flex-1 items-center gap-1.5 min-w-0"
          onClick={() => {
            onSelect(node.slug);
            if (hasChildren) setExpanded((v) => !v);
          }}
        >
          {hasChildren ? (
            <ChevronRight
              className={cn(
                'size-3 shrink-0 transition-transform',
                expanded && 'rotate-90',
              )}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            />
          ) : (
            <FileText className="size-3 shrink-0 text-muted-foreground/60" />
          )}
          <span className="truncate">{node.title}</span>
          {isDraft && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Draft
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 hover:bg-accent"
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" sideOffset={4}>
            <DropdownMenuItem onClick={() => onCreateChild(node.id)}>
              <Plus className="size-3.5 mr-2" />
              Add child article
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(node.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <ArticleTreeItem
              key={child.id}
              node={child}
              projectKey={projectKey}
              selectedSlug={selectedSlug}
              depth={depth + 1}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
