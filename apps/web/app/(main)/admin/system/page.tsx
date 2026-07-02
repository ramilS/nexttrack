'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Database } from 'lucide-react';

export default function AdminSystemPage() {
  const [reindexing, setReindexing] = useState(false);
  const [reindexOpen, setReindexOpen] = useState(false);

  async function handleReindex() {
    setReindexing(true);
    try {
      // async: the endpoint enqueues a background reindex and returns
      // immediately, so a large index doesn't block the request (→ timeout).
      await apiClient.post('/search/reindex', { async: true });
      toast.success('Reindex started successfully');
    } catch {
      toast.error('Failed to start reindex');
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="p-8">
      <PageHeader title="System" description="System maintenance and diagnostics." />

      <div className="mt-6 space-y-6 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" />
              Search Index
            </CardTitle>
            <CardDescription>
              Rebuild the full-text search index. Use this if search results seem incomplete or stale.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setReindexOpen(true)} disabled={reindexing} variant="outline">
              {reindexing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Reindex All Issues
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={reindexOpen}
        onOpenChange={setReindexOpen}
        title="Reindex all issues"
        description="This reindexes all issues in Elasticsearch. It runs in the background and may take a few minutes."
        confirmLabel="Continue"
        onConfirm={handleReindex}
      />
    </div>
  );
}
