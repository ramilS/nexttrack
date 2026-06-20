'use client';

export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="w-72 min-w-72 rounded-lg bg-muted/30 border border-border/50">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
            <div className="h-2.5 w-2.5 rounded-full bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="ml-auto h-3 w-6 rounded bg-muted animate-pulse" />
          </div>

          {/* Cards */}
          <div className="p-2 space-y-2">
            {Array.from({ length: 2 + (i % 2) }).map((_, j) => (
              <div key={j} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-14 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-3 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="h-4 w-full rounded bg-muted animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="flex items-center justify-between pt-1">
                  <div className="h-3 w-10 rounded bg-muted animate-pulse" />
                  <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
