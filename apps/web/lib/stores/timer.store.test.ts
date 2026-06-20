import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useTimerStore } from './timer.store';

describe('useTimerStore', () => {
  beforeEach(() => {
    useTimerStore.setState({
      isRunning: false,
      issueId: null,
      issueKey: null,
      startedAt: null,
      elapsed: 0,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with idle state', () => {
    const state = useTimerStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.issueId).toBeNull();
    expect(state.elapsed).toBe(0);
  });

  it('start sets running state', () => {
    useTimerStore.getState().start('issue-1', 'PROJ-1');

    const state = useTimerStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.issueId).toBe('issue-1');
    expect(state.issueKey).toBe('PROJ-1');
    expect(state.startedAt).toBeInstanceOf(Date);
    expect(state.elapsed).toBe(0);
  });

  it('stop resets all state', () => {
    useTimerStore.getState().start('issue-1', 'PROJ-1');
    useTimerStore.getState().stop();

    const state = useTimerStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.issueId).toBeNull();
    expect(state.issueKey).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.elapsed).toBe(0);
  });

  it('tick updates elapsed time', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useTimerStore.getState().start('issue-1', 'PROJ-1');

    vi.setSystemTime(new Date('2026-01-01T00:01:30Z'));
    useTimerStore.getState().tick();

    expect(useTimerStore.getState().elapsed).toBe(90);
  });

  it('tick does nothing without startedAt', () => {
    useTimerStore.getState().tick();
    expect(useTimerStore.getState().elapsed).toBe(0);
  });

  it('sync hydrates from server state', () => {
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));

    useTimerStore.getState().sync({
      issueId: 'issue-1',
      startedAt: '2026-01-01T00:00:00Z',
      issue: { projectKey: 'PROJ', number: 42 },
    });

    const state = useTimerStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.issueId).toBe('issue-1');
    expect(state.issueKey).toBe('PROJ-42');
    expect(state.elapsed).toBe(300);
  });

  it('sync with null clears state', () => {
    useTimerStore.getState().start('issue-1', 'PROJ-1');
    useTimerStore.getState().sync(null);

    const state = useTimerStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.issueId).toBeNull();
  });

  it('sync without issue sets issueKey to null', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));

    useTimerStore.getState().sync({
      issueId: 'issue-1',
      startedAt: '2026-01-01T00:00:00Z',
      issue: null,
    });

    expect(useTimerStore.getState().issueKey).toBeNull();
  });
});
