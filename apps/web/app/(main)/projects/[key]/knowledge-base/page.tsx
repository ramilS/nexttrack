'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { BookOpen } from 'lucide-react';
import { ArticleTree } from '@/components/knowledge-base/article-tree';
import { EmptyState } from '@/components/shared/empty-state';

export default function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const router = useRouter();

  function handleSelect(slug: string) {
    router.push(routes.project(key).knowledgeBase.article(slug));
  }

  return (
    <div className="flex h-[calc(100vh-112px)]">
      {/* Sidebar — article tree */}
      <aside className="w-64 shrink-0 border-r border-border overflow-y-auto">
        <ArticleTree projectKey={key} onSelect={handleSelect} />
      </aside>

      {/* Main — empty state */}
      <main className="flex-1 overflow-y-auto">
        <EmptyState
          icon={BookOpen}
          title="Select an article"
          description="Choose an article from the sidebar or create a new one to get started."
          shortcuts={[
            { keys: ['⌘', 'K'], label: 'Command palette' },
            { keys: ['⌘', '/'], label: 'Search syntax help' },
          ]}
        />
      </main>
    </div>
  );
}
