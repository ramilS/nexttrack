import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { UserAvatar } from './user-avatar';

// Mock Avatar to simplify testing
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, ...props }: { children?: React.ReactNode; className?: string }) => <div data-testid="avatar" className={className} {...props}>{children}</div>,
  // eslint-disable-next-line @next/next/no-img-element
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => src ? <img data-testid="avatar-image" src={src} alt={alt} /> : null,
  AvatarFallback: ({ children, className }: { children?: React.ReactNode; className?: string }) => <span data-testid="avatar-fallback" className={className}>{children}</span>,
}));

describe('UserAvatar', () => {
  it('renders initials when no avatar URL', () => {
    render(<UserAvatar user={{ name: 'John Doe' }} />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('JD');
  });

  it('renders single initial for single name', () => {
    render(<UserAvatar user={{ name: 'Alice' }} />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('A');
  });

  it('renders image when avatarUrl is provided', () => {
    render(<UserAvatar user={{ name: 'John', avatarUrl: 'https://example.com/avatar.jpg' }} />);
    expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
  });

  it('applies sm size class', () => {
    render(<UserAvatar user={{ name: 'John' }} size="sm" />);
    expect(screen.getByTestId('avatar').className).toContain('size-7');
  });

  it('applies md size class by default', () => {
    render(<UserAvatar user={{ name: 'John' }} />);
    expect(screen.getByTestId('avatar').className).toContain('size-9');
  });

  it('applies lg size class', () => {
    render(<UserAvatar user={{ name: 'John' }} size="lg" />);
    expect(screen.getByTestId('avatar').className).toContain('size-11');
  });

  it('exposes the full name as a title for hover', () => {
    render(<UserAvatar user={{ name: 'John Doe' }} />);
    expect(screen.getByTestId('avatar')).toHaveAttribute('title', 'John Doe');
  });

  it('omits the title when name is missing', () => {
    render(<UserAvatar user={{ name: null }} />);
    expect(screen.getByTestId('avatar')).not.toHaveAttribute('title');
  });
});
