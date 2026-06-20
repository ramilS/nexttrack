import { describe, it, expect, beforeEach } from 'vitest';
import { useSidebarStore } from './sidebar.store';

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({ isCollapsed: false });
  });

  it('defaults to expanded', () => {
    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });

  it('toggle flips collapsed state', () => {
    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().isCollapsed).toBe(true);

    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });

  it('setCollapsed sets exact value', () => {
    useSidebarStore.getState().setCollapsed(true);
    expect(useSidebarStore.getState().isCollapsed).toBe(true);

    useSidebarStore.getState().setCollapsed(false);
    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });
});
