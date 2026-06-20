import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { CommandPalette } from '@/components/layout/command-palette';
import { GlobalCreateIssueDialog } from '@/components/issues/global-create-issue-dialog';
import { GlobalCreateBoardDialog } from '@/components/boards/global-create-board-dialog';
import { AuthGuard } from '@/components/auth/auth-guard';
import { SocketProvider } from '@/providers/socket-provider';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <SocketProvider>
          <AppShell>
            {children}
            <CommandPalette />
            <GlobalCreateIssueDialog />
            <GlobalCreateBoardDialog />
          </AppShell>
        </SocketProvider>
      </AuthGuard>
    </Suspense>
  );
}
