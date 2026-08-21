import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { ApiKey, IssuedApiKey } from '@repo/shared/schemas';
import { ApiKeysCard } from './api-keys-card';

/**
 * `useCreateApiKey` is mocked with a real `useState`-backed hook (not a bare
 * `vi.fn()`) so it behaves like the production mutation: calling `mutate`
 * updates `data`, and `reset` clears it back to `null` — exactly the state
 * transition `ApiKeysCard` relies on to open/close the reveal dialog.
 */
let mockKeys: ApiKey[] = [];
let issuedKey: IssuedApiKey | null = null;
const revokeMutate = vi.fn();

function useCreateApiKeyMock() {
  const [data, setData] = useState<IssuedApiKey | null>(null);
  return {
    data,
    isPending: false,
    mutate: (
      _variables: { name: string; expiresAt?: string },
      options?: { onSuccess?: (result: IssuedApiKey) => void },
    ) => {
      if (!issuedKey) return;
      setData(issuedKey);
      options?.onSuccess?.(issuedKey);
    },
    reset: () => setData(null),
  };
}

vi.mock('@/lib/hooks/use-api-keys', () => ({
  useApiKeys: () => ({ data: mockKeys, isLoading: false }),
  useCreateApiKey: () => useCreateApiKeyMock(),
  useRevokeApiKey: () => ({ mutate: revokeMutate, isPending: false }),
}));

describe('ApiKeysCard', () => {
  beforeEach(() => {
    mockKeys = [];
    issuedKey = null;
    revokeMutate.mockClear();
  });

  it('shows the secret once after creation and only the prefix afterwards', async () => {
    // Simulates the list having refetched and already holding the new key —
    // in production this lands via query invalidation; here it lets the
    // assertion below tell "prefix still shown" apart from "list is just empty".
    mockKeys = [
      {
        id: 'k1',
        name: 'MyTracker',
        prefix: 'nt_abcdefgh',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    issuedKey = {
      id: 'k1',
      name: 'MyTracker',
      prefix: 'nt_abcdefgh',
      raw: 'nt_abcdefghSECRET',
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };

    render(<ApiKeysCard projectKey="DEMO" />);

    await userEvent.type(screen.getByLabelText('Name'), 'MyTracker');
    await userEvent.click(screen.getByRole('button', { name: /create key/i }));

    await waitFor(() => {
      expect(screen.getByText('nt_abcdefghSECRET')).toBeInTheDocument();
    });
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();

    // Dismissing the dialog must purge the secret from every render path —
    // only the prefix (shown in the list) may remain.
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByText('nt_abcdefghSECRET')).not.toBeInTheDocument();
    expect(screen.getByText('nt_abcdefgh…')).toBeInTheDocument();
  });

  it('renders the empty state when the project has no keys', () => {
    mockKeys = [];
    render(<ApiKeysCard projectKey="DEMO" />);
    expect(screen.getByText(/no api keys/i)).toBeInTheDocument();
  });

  it('asks for confirmation before revoking an active key', async () => {
    mockKeys = [
      {
        id: 'k1',
        name: 'MyTracker',
        prefix: 'nt_abcdefgh',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ApiKeysCard projectKey="DEMO" />);

    await userEvent.click(screen.getByRole('button', { name: /^revoke$/i }));
    expect(revokeMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /yes, revoke/i }));
    expect(revokeMutate).toHaveBeenCalledWith('k1');
  });
});
