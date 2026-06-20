import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CommandContextProvider, useCommandContext } from './command-context';
import { useCommandContextStore } from '@/lib/stores/command-context.store';
import type { ReactNode } from 'react';

beforeEach(() => {
  act(() => useCommandContextStore.getState().clearContext());
});

describe('CommandContext', () => {
  it('reads empty context when nothing is published', () => {
    const { result } = renderHook(() => useCommandContext());

    expect(result.current.activeIssue).toBeNull();
    expect(result.current.selectedIssueIds).toEqual([]);
    expect(result.current.currentProject).toBeNull();
    expect(result.current.currentUser).toBeNull();
  });

  it('publishes the provided context into the store', () => {
    const project = { key: 'PROJ', id: 'p1' };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CommandContextProvider value={{ currentProject: project, selectedIssueIds: ['i1', 'i2'] }}>
        {children}
      </CommandContextProvider>
    );

    const { result } = renderHook(() => useCommandContext(), { wrapper });

    expect(result.current.currentProject).toEqual(project);
    expect(result.current.selectedIssueIds).toEqual(['i1', 'i2']);
    expect(result.current.activeIssue).toBeNull();
  });

  it('clears the context when the provider unmounts', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CommandContextProvider value={{ currentProject: { key: 'PROJ', id: 'p1' } }}>
        {children}
      </CommandContextProvider>
    );

    const { unmount } = renderHook(() => useCommandContext(), { wrapper });
    expect(useCommandContextStore.getState().currentProject).toEqual({ key: 'PROJ', id: 'p1' });

    unmount();

    expect(useCommandContextStore.getState().currentProject).toBeNull();
  });
});
