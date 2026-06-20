'use client';

import { PageHeader } from '@/components/shared/page-header';
import { NotificationPreferences } from '@/components/notifications/notification-preferences';

export default function NotificationPreferencesPage() {
  return (
    <div className="max-w-160 p-8">
      <PageHeader
        title="Notification Preferences"
        description="Choose how and when you receive notifications."
      />
      <div className="mt-6">
        <NotificationPreferences />
      </div>
    </div>
  );
}
