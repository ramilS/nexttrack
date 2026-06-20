'use client';

import { PageHeader } from '@/components/shared/page-header';
import { RoleList } from '@/components/admin/role-list';

export default function AdminRolesPage() {
  return (
    <div className="p-8">
      <PageHeader
        title="Role Management"
        description="Manage project roles and their permissions. System roles cannot be deleted."
      />
      <div className="mt-6">
        <RoleList />
      </div>
    </div>
  );
}
