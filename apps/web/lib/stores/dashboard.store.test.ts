import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore } from './dashboard.store';

describe('useDashboardStore', () => {
  beforeEach(() => {
    useDashboardStore.setState({ activeDashboardId: null });
  });

  it('starts with null active dashboard', () => {
    expect(useDashboardStore.getState().activeDashboardId).toBeNull();
  });

  it('setActiveDashboardId sets the id', () => {
    useDashboardStore.getState().setActiveDashboardId('dash-1');
    expect(useDashboardStore.getState().activeDashboardId).toBe('dash-1');
  });

  it('setActiveDashboardId(null) clears the id', () => {
    useDashboardStore.getState().setActiveDashboardId('dash-1');
    useDashboardStore.getState().setActiveDashboardId(null);
    expect(useDashboardStore.getState().activeDashboardId).toBeNull();
  });
});
