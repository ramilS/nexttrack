import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@/test/test-utils';
import { fireEvent } from '@testing-library/react';
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
const createMutateSpy = vi.fn();

function useCreateApiKeyMock() {
  const [data, setData] = useState<IssuedApiKey | null>(null);
  return {
    data,
    isPending: false,
    mutate: (
      variables: { name: string; expiresAt?: string },
      options?: { onSuccess?: (result: IssuedApiKey) => void },
    ) => {
      createMutateSpy(variables);
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
    createMutateSpy.mockClear();
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

  it('rejects a past expiry date at the input level via min', () => {
    render(<ApiKeysCard projectKey="DEMO" />);
    const expiresInput = screen.getByLabelText('Expires') as HTMLInputElement;
    const today = new Date();
    const expectedMin = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    expect(expiresInput.min).toBe(expectedMin);
  });

  it('sends the end-of-day instant for a chosen expiry date, not UTC midnight', async () => {
    render(<ApiKeysCard projectKey="DEMO" />);

    // A date safely in the future — the input's `min` (today) would block
    // native form submission for a past date.
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const futureValue = [
      future.getFullYear(),
      String(future.getMonth() + 1).padStart(2, '0'),
      String(future.getDate()).padStart(2, '0'),
    ].join('-');

    await userEvent.type(screen.getByLabelText('Name'), 'MyTracker');
    const expiresInput = screen.getByLabelText('Expires');
    // userEvent.type does not support type="date" inputs reliably across
    // browsers/jsdom; fireEvent.change is the standard escape hatch for
    // committing a value to a controlled date input in tests.
    fireEvent.change(expiresInput, { target: { value: futureValue } });

    await userEvent.click(screen.getByRole('button', { name: /create key/i }));

    expect(createMutateSpy).toHaveBeenCalledTimes(1);
    const call = createMutateSpy.mock.calls[0];
    expect(call).toBeDefined();
    const sentExpiresAt = (call as [{ expiresAt: string }])[0].expiresAt;
    expect(sentExpiresAt).not.toBe(`${futureValue}T00:00:00.000Z`);
    const parsed = new Date(sentExpiresAt);
    expect(parsed.getHours()).toBe(23);
    expect(parsed.getMinutes()).toBe(59);
  });
});
