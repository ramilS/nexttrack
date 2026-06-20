'use client';

import { useState } from 'react';
import { Plus, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';
import { AddWidgetDialog } from '@/components/dashboard/add-widget-dialog';
import { useDashboards, useCreateDashboard } from '@/lib/hooks/use-dashboards';
import { useAuthStore } from '@/lib/stores/auth.store';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: dashboards, isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);

  const activeDashboard = dashboards?.find((d) => d.isDefault) ?? dashboards?.[0];

  function handleCreateDashboard() {
    createDashboard.mutate({ name: 'My Dashboard' });
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6" aria-busy="true" aria-live="polite" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title={activeDashboard?.name ?? `Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description={activeDashboard ? undefined : "Here's what's happening across your projects."}
        actions={
          activeDashboard ? (
            <Button variant="outline" size="sm" onClick={() => setAddWidgetOpen(true)}>
              <Plus className="size-3.5" />
              Add Widget
            </Button>
          ) : undefined
        }
      />

      {activeDashboard ? (
        <>
          {activeDashboard.widgets.length === 0 ? (
            <EmptyState
              icon={LayoutDashboard}
              title="Your dashboard is empty"
              description="Add widgets to customize your dashboard."
              action={{ label: 'Add Widget', onClick: () => setAddWidgetOpen(true) }}
              shortcuts={[
                { keys: ['⌘', 'K'], label: 'Command palette' },
                { keys: ['⌘', '\\'], label: 'Toggle sidebar' },
              ]}
            />
          ) : (
            <DashboardGrid dashboard={activeDashboard} />
          )}
          <AddWidgetDialog
            open={addWidgetOpen}
            onOpenChange={setAddWidgetOpen}
            dashboardId={activeDashboard.id}
          />
        </>
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="No dashboard yet"
          description="Create your first dashboard to get started."
          action={{ label: 'Create Dashboard', onClick: handleCreateDashboard }}
          shortcuts={[
            { keys: ['⌘', 'K'], label: 'Command palette' },
            { keys: ['⌘', '\\'], label: 'Toggle sidebar' },
          ]}
        />
      )}
    </div>
  );
}
