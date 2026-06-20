'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { subDays, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTimeReport, useExportTimeReport } from '@/lib/hooks/use-time-tracking';
import { TimeReportChart } from './time-report-chart';
import { TimeReportTable } from './time-report-table';
import type { ReportGroupBy } from '@/lib/api/time-tracking.api';

interface TimeReportProps {
  projectKey: string;
}

const GROUP_OPTIONS: { value: ReportGroupBy; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'DATE', label: 'Date' },
  { value: 'USER_ISSUE', label: 'User → Issue' },
];

export function TimeReport({ projectKey }: TimeReportProps) {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 14), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('USER');

  const params = { dateFrom, dateTo, groupBy };
  const { data: report, isLoading } = useTimeReport(projectKey, params);
  const exportReport = useExportTimeReport(projectKey);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-40 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-40 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Group by</Label>
          <Select
            value={groupBy}
            onValueChange={(v: string | null) => {
              if (v) setGroupBy(v as ReportGroupBy);
            }}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue>
                {(value: string | null) => {
                  const opt = GROUP_OPTIONS.find((o) => o.value === value);
                  return opt?.label ?? 'Select group';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => exportReport.mutate(params)}
          disabled={exportReport.isPending}
        >
          {exportReport.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Export CSV
        </Button>
      </div>

      <AsyncContent loading={isLoading} data={report}>
        {(report) => (
          <div className="space-y-6">
            {/* Summary */}
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total: </span>
                <span className="font-semibold">{report.totalDurationFormatted}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Users: </span>
                <span className="font-medium">{report.summary.usersCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Issues: </span>
                <span className="font-medium">{report.summary.issuesCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Entries: </span>
                <span className="font-medium">{report.summary.logsCount}</span>
              </div>
            </div>

            <TimeReportChart groups={report.groups} groupBy={groupBy} />
            <TimeReportTable groups={report.groups} groupBy={groupBy} />
          </div>
        )}
      </AsyncContent>
    </div>
  );
}
