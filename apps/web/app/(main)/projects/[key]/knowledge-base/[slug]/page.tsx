'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { ArticleTree } from '@/components/knowledge-base/article-tree';
import { ArticlePage } from '@/components/knowledge-base/article-page';

export default function KnowledgeBaseArticlePage({
  params,
}: {
  params: Promise<{ key: string; slug: string }>;
}) {
  const { key, slug } = use(params);
  const router = useRouter();

  function handleSelect(articleSlug: string) {
    router.push(routes.project(key).knowledgeBase.article(articleSlug));
  }

  return (
    <div className="flex h-[calc(100vh-112px)]">
      {/* Sidebar — article tree */}
      <aside className="w-64 shrink-0 border-r border-border overflow-y-auto">
        <ArticleTree projectKey={key} selectedSlug={slug} onSelect={handleSelect} />
      </aside>

      {/* Main — article content */}
      <main className="flex-1 overflow-y-auto">
        <ArticlePage projectKey={key} slug={slug} />
      </main>
    </div>
  );
}
