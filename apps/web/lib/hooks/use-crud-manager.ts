'use client';

import { useState, useCallback } from 'react';

interface CRUDManagerState<T> {
  createOpen: boolean;
  editingItem: T | null;
  deletingItem: T | null;
  openCreate: () => void;
  closeCreate: () => void;
  startEdit: (item: T) => void;
  stopEdit: () => void;
  startDelete: (item: T) => void;
  stopDelete: () => void;
}

export function useCRUDManager<T>(): CRUDManagerState<T> {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [deletingItem, setDeletingItem] = useState<T | null>(null);

  const openCreate = useCallback(() => setCreateOpen(true), []);
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const startEdit = useCallback((item: T) => setEditingItem(item), []);
  const stopEdit = useCallback(() => setEditingItem(null), []);
  const startDelete = useCallback((item: T) => setDeletingItem(item), []);
  const stopDelete = useCallback(() => setDeletingItem(null), []);

  return {
    createOpen,
    editingItem,
    deletingItem,
    openCreate,
    closeCreate,
    startEdit,
    stopEdit,
    startDelete,
    stopDelete,
  };
}
