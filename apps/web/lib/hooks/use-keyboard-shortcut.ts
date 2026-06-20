'use client';

import { useEffect } from 'react';

interface KeyCombo {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
}

export function useKeyboardShortcut(combo: KeyCombo, callback: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA' ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const metaMatch = combo.meta ? (e.metaKey || e.ctrlKey) : true;
      const shiftMatch = combo.shift ? e.shiftKey : !e.shiftKey;

      if (e.key === combo.key && metaMatch && shiftMatch) {
        e.preventDefault();
        callback();
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [combo, callback]);
}
