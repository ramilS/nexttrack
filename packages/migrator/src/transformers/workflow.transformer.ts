import { YtState } from '../youtrack/types/yt-project.type';
import { v4 as uuidv4 } from 'uuid';

type StatusCategory = 'UNSTARTED' | 'STARTED' | 'DONE';

export interface WorkflowStatus {
  id: string;
  name: string;
  color: string;
  category: StatusCategory;
  isInitial: boolean;
  isResolved: boolean;
  ordinal: number;
}

export interface WorkflowTransition {
  id: string;
  name: string;
  fromStatusId: string;
  toStatusId: string;
  requiredRole: string | null;
}

export interface CreateWorkflowDto {
  name: string;
  isDefault: boolean;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

export class WorkflowTransformer {
  transform(ytStates: YtState[]): CreateWorkflowDto {
    const statuses: WorkflowStatus[] = ytStates.map((state, i) => ({
      id: uuidv4(),
      name: state.name,
      color: state.color ?? this.inferColor(state),
      category: this.inferCategory(state),
      isInitial: i === 0,
      isResolved: state.isResolved ?? false,
      ordinal: i,
    }));

    const transitions: WorkflowTransition[] = statuses.map((s) => ({
      id: uuidv4(),
      name: `Move to ${s.name}`,
      fromStatusId: '*',
      toStatusId: s.id,
      requiredRole: null,
    }));

    return { name: 'Migrated from YouTrack', isDefault: true, statuses, transitions };
  }

  private inferCategory(state: YtState): StatusCategory {
    if (state.isResolved) return 'DONE';
    const name = state.name.toLowerCase();
    if (name.includes('progress') || name.includes('review') || name.includes('testing')) {
      return 'STARTED';
    }
    return 'UNSTARTED';
  }

  private inferColor(state: YtState): string {
    if (state.isResolved) return '#22c55e';
    const name = state.name.toLowerCase();
    if (name.includes('progress')) return '#3b82f6';
    if (name.includes('review')) return '#8b5cf6';
    if (name.includes('fix') || name.includes('bug')) return '#ef4444';
    if (name.includes('test')) return '#f59e0b';
    return '#6b7280';
  }
}
