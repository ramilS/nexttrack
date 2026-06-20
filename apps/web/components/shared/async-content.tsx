import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BaseProps {
  loading: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  spinnerClassName?: string;
}

interface SimpleProps extends BaseProps {
  empty?: boolean;
  children: React.ReactNode;
}

interface DataProps<T> extends BaseProps {
  data: T | undefined | null;
  empty?: boolean | ((data: T) => boolean);
  children: (data: T) => React.ReactNode;
}

export function AsyncContent(props: SimpleProps): React.ReactElement | null;
export function AsyncContent<T>(props: DataProps<T>): React.ReactElement | null;
export function AsyncContent<T>(
  props: SimpleProps | DataProps<T>,
): React.ReactElement | null {
  const { loading, emptyState, className, spinnerClassName } = props;

  if (loading) {
    return (
      <div
        className={cn('flex justify-center py-12', className)}
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading content"
      >
        <Loader2
          className={cn(
            'size-5 animate-spin text-muted-foreground',
            spinnerClassName,
          )}
        />
      </div>
    );
  }

  if ('data' in props) {
    const { data, empty, children } = props as DataProps<T>;

    if (data == null) {
      return emptyState ? <>{emptyState}</> : null;
    }

    const isEmpty =
      typeof empty === 'function' ? empty(data) : (empty ?? false);
    if (isEmpty && emptyState) return <>{emptyState}</>;

    return <>{children(data)}</>;
  }

  const { empty = false, children } = props as SimpleProps;
  if (empty && emptyState) return <>{emptyState}</>;

  return <>{children}</>;
}
