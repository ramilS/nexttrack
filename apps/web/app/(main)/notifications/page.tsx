'use client';

import Link from 'next/link';
import { routes } from '@/lib/routes';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { NotificationList } from '@/components/notifications/notification-list';

export default function NotificationsPage() {
  return (
    <div className="max-w-180 p-8">
      <div className="flex items-start justify-between">
        <PageHeader title="Notifications" description="Stay updated on your projects and issues." />
        <Button variant="outline" size="sm" className="shrink-0" render={<Link href={routes.notifications.preferences} />} nativeButton={false}>
          <Settings2 className="size-3.5" />
          Preferences
        </Button>
      </div>
      <div className="mt-6">
        <NotificationList />
      </div>
    </div>
  );
}
