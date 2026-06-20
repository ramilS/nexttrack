import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold tabular-nums">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link
        href={routes.dashboard}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
