import { GuestGuard } from '@/components/auth/guest-guard';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuestGuard>
      <div className="flex min-h-screen items-center justify-center bg-background">
        {children}
      </div>
    </GuestGuard>
  );
}
