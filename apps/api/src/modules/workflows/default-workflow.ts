import { randomUUID } from 'crypto';
import type {
  WorkflowStatus,
  WorkflowTransition,
} from '@repo/shared/schemas';

interface DefaultWorkflowSeed {
  name: string;
  isDefault: boolean;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

export function generateDefaultWorkflow(): DefaultWorkflowSeed {
  const openId = randomUUID();
  const inProgressId = randomUUID();
  const inReviewId = randomUUID();
  const doneId = randomUUID();
  const wontFixId = randomUUID();

  const statuses: WorkflowStatus[] = [
    { id: openId, name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
    { id: inProgressId, name: 'In Progress', color: '#3b82f6', category: 'STARTED', isInitial: false, isResolved: false, ordinal: 1 },
    { id: inReviewId, name: 'In Review', color: '#8b5cf6', category: 'STARTED', isInitial: false, isResolved: false, ordinal: 2 },
    { id: doneId, name: 'Done', color: '#22c55e', category: 'DONE', isInitial: false, isResolved: true, ordinal: 3 },
    { id: wontFixId, name: "Won't Fix", color: '#ef4444', category: 'DONE', isInitial: false, isResolved: true, ordinal: 4 },
  ];

  const transitions: WorkflowTransition[] = [
    { id: randomUUID(), name: 'Start', fromStatusId: '*', toStatusId: inProgressId, requiredRole: null },
    { id: randomUUID(), name: 'Review', fromStatusId: inProgressId, toStatusId: inReviewId, requiredRole: null },
    { id: randomUUID(), name: 'Approve', fromStatusId: inReviewId, toStatusId: doneId, requiredRole: 'OWNER' },
    { id: randomUUID(), name: 'Reject', fromStatusId: inReviewId, toStatusId: inProgressId, requiredRole: 'OWNER' },
    { id: randomUUID(), name: "Won't Fix", fromStatusId: '*', toStatusId: wontFixId, requiredRole: null },
    { id: randomUUID(), name: 'Reopen', fromStatusId: doneId, toStatusId: openId, requiredRole: null },
  ];

  return { name: 'Default', isDefault: true, statuses, transitions };
}
