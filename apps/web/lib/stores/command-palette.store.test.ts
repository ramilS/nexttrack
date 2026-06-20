import { describe, it, expect, beforeEach } from 'vitest';
import { useCommandPaletteStore } from './command-palette.store';

describe('useCommandPaletteStore', () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({ isOpen: false });
  });

  it('starts closed', () => {
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('open sets isOpen to true', () => {
    useCommandPaletteStore.getState().open();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });

  it('close sets isOpen to false', () => {
    useCommandPaletteStore.getState().open();
    useCommandPaletteStore.getState().close();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('toggle flips isOpen', () => {
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);

    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });
});
