'use client';

import { useState } from 'react';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { SearchResults } from '@/components/search/search-results';
import { SyntaxHelpDialog } from '@/components/filters/syntax-help-dialog';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';

export default function SearchPage() {
  const [helpOpen, setHelpOpen] = useState(false);

  useKeyboardShortcut({ key: '/', meta: true }, () => setHelpOpen(true));

  return (
    <div className="p-8">
      <PageHeader title="Search" description="Find issues across all projects." />
      <div className="mt-6">
        <Suspense fallback={null}>
          <SearchResults onHelpClick={() => setHelpOpen(true)} />
        </Suspense>
      </div>
      <SyntaxHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
