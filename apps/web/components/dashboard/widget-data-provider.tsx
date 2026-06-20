'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardsApi } from '@/lib/api/dashboards.api';
import { dashboardKeys, WidgetBatchContext } from '@/lib/hooks/use-dashboards';

export function WidgetDataProvider({
  dashboardId,
  children,
}: {
  dashboardId: string;
  children: React.ReactNode;
}) {
  const query = useQuery({
    queryKey: [...dashboardKeys.all, 'all-widget-data', dashboardId],
    queryFn: () => dashboardsApi.getAllWidgetData(dashboardId).then((r) => r.data),
    enabled: !!dashboardId,
    staleTime: 30_000,
  });

  const value = useMemo(
    () => ({ data: query.data, isLoading: query.isLoading }),
    [query.data, query.isLoading],
  );

  return (
    <WidgetBatchContext value={value}>
      {children}
    </WidgetBatchContext>
  );
}
