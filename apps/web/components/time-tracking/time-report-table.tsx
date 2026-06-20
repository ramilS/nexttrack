'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, User, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TimeReportGroup, ReportGroupBy } from '@/lib/api/time-tracking.api';

interface TimeReportTableProps {
  groups: TimeReportGroup[];
  groupBy: ReportGroupBy;
}

function GroupIcon({ groupBy }: { groupBy: ReportGroupBy }) {
  switch (groupBy) {
    case 'USER':
    case 'USER_ISSUE':
      return <User className="size-3.5 text-muted-foreground" />;
    case 'ISSUE':
      return <FileText className="size-3.5 text-muted-foreground" />;
    case 'DATE':
      return <Calendar className="size-3.5 text-muted-foreground" />;
  }
}

function GroupRow({ group, groupBy, depth = 0 }: { group: TimeReportGroup; groupBy: ReportGroupBy; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = group.subGroups && group.subGroups.length > 0;

  const label = groupBy === 'DATE' && depth === 0
    ? format(new Date(group.key), 'EEEE, MMM d, yyyy')
    : group.label;

  return (
    <>
      <button
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 hover:bg-accent/30 transition-colors text-left',
          depth === 0 && 'border-b border-border',
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
        ) : (
          <span className="w-3" />
        )}
        <GroupIcon groupBy={depth === 0 ? groupBy : 'ISSUE'} />
        <span className="text-sm font-medium truncate flex-1">{label}</span>
        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {group.durationFormatted}
        </span>
      </button>

      {expanded && hasChildren && group.subGroups!.map((sub) => (
        <GroupRow key={sub.key} group={sub} groupBy={groupBy} depth={depth + 1} />
      ))}
    </>
  );
}

export function TimeReportTable({ groups, groupBy }: TimeReportTableProps) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No time logged in this period.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {groups.map((group) => (
        <GroupRow key={group.key} group={group} groupBy={groupBy} />
      ))}
    </div>
  );
}
