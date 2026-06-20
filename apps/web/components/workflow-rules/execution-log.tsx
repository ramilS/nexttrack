'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { RelativeTime } from '@/components/shared/relative-time';
import { useWorkflowExecutionLog } from '@/lib/hooks/use-workflow-rules';

interface ExecutionLogProps {
  projectKey: string;
  ruleId: string;
}

const STATUS_STYLES = {
  success: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
} as const;

export function ExecutionLog({ projectKey, ruleId }: ExecutionLogProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useWorkflowExecutionLog(
    projectKey,
    ruleId,
    page,
  );

  return (
    <AsyncContent
      loading={isLoading}
      data={data}
      empty={(d) => !d.items.length}
      emptyState={
        <div className="py-8 text-center text-sm text-muted-foreground">
          No executions yet
        </div>
      }
      className="py-8"
    >
      {(data) => (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Issue</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Duration</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-2 pr-4">
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.issueId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] px-1.5 py-0 font-normal',
                          entry.success ? STATUS_STYLES.success : STATUS_STYLES.failed,
                        )}
                      >
                        {entry.success ? 'SUCCESS' : 'FAILED'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs text-muted-foreground">
                        {entry.duration}ms
                      </span>
                    </td>
                    <td className="py-2">
                      <RelativeTime date={entry.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  className="size-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  className="size-7"
                  disabled={page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </AsyncContent>
  );
}
