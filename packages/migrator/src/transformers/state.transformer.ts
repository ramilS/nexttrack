import { YtState } from '../youtrack/types/yt-project.type';

export type StatusCategory = 'UNSTARTED' | 'STARTED' | 'DONE';

export interface MigrationStatus {
  name: string;
  category: StatusCategory;
  isInitial: boolean;
  isResolved: boolean;
  ordinal: number;
  color?: string;
}

// Maps YouTrack State bundle values to the migration project-create status
// payload. Heuristic categories: resolved → DONE, the first state → UNSTARTED
// (the initial), the rest → STARTED. The server still enforces one initial.
export function mapStatesToStatuses(states: YtState[]): MigrationStatus[] {
  return states.map((state, i) => ({
    name: state.name,
    category: state.isResolved ? 'DONE' : i === 0 ? 'UNSTARTED' : 'STARTED',
    isInitial: i === 0,
    isResolved: state.isResolved ?? false,
    ordinal: i,
    color: state.color,
  }));
}
