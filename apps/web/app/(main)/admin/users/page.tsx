'use client';

import { PageHeader } from '@/components/shared/page-header';
import { UserList } from '@/components/admin/user-list';

export default function AdminUsersPage() {
  return (
    <div className="p-8">
      <PageHeader title="User Management" description="Manage users, roles, and invitations." />
      <div className="mt-6">
        <UserList />
      </div>
    </div>
  );
}
