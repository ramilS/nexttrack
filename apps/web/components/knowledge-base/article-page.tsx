'use client';

import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useArticle } from '@/lib/hooks/use-articles';
import { ArticleEditor } from './article-editor';
import { ArticleComments } from './article-comments';

interface ArticlePageProps {
  projectKey: string;
  slug: string;
}

export function ArticlePage({ projectKey, slug }: ArticlePageProps) {
  const { data: article, isLoading, isError } = useArticle(projectKey, slug);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-base font-medium">Article not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The article you&apos;re looking for doesn&apos;t exist or has been deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-200 mx-auto py-8 px-6">
      <ArticleEditor projectKey={projectKey} article={article} />
      <Separator className="my-8" />
      <ArticleComments projectKey={projectKey} articleId={article.id} />
    </div>
  );
}
