import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { IssuedApiKey } from '@repo/shared/schemas';
import { ApiKeyCreatedDialog } from './api-key-created-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

const issuedKey: IssuedApiKey = {
  id: 'k1',
  name: 'MyTracker',
  prefix: 'nt_abcdefgh',
  raw: 'nt_abcdefghSECRET',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date().toISOString(),
};

describe('ApiKeyCreatedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips the button to "Copied" only once the clipboard write resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ApiKeyCreatedDialog apiKey={issuedKey} onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy key' }));

    expect(writeText).toHaveBeenCalledWith('nt_abcdefghSECRET');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not claim success and warns instead when the clipboard write is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ApiKeyCreatedDialog apiKey={issuedKey} onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy key' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
    // The button must still read "Copy key" — the secret was never actually copied.
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();

    // The failure toast must never leak the secret it failed to copy.
    const call = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const [message] = call as [string];
    expect(message).not.toContain(issuedKey.raw);
  });
});
