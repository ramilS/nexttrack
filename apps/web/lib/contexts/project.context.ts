'use client';

import { createContext, useContext } from 'react';
import type { Project } from '@repo/shared/schemas';

export const ProjectContext = createContext<Project | null>(null);

export function useProjectContext() {
  const project = useContext(ProjectContext);
  if (!project) {
    throw new Error('useProjectContext must be used within a ProjectContext.Provider');
  }
  return project;
}
