import type { IssueType, IssuePriority } from '../schemas/issue.schema';

export interface LabeledOption<T extends string = string> {
  value: T;
  label: string;
}

/** All issue type options with display labels. */
export const ISSUE_TYPE_OPTIONS: LabeledOption<IssueType>[] = [
  { value: 'TASK', label: 'Task' },
  { value: 'BUG', label: 'Bug' },
  { value: 'STORY', label: 'Story' },
  { value: 'EPIC', label: 'Epic' },
  { value: 'FEATURE', label: 'Feature' },
];

/** All issue priority options with display labels (highest first). */
export const ISSUE_PRIORITY_OPTIONS: LabeledOption<IssuePriority>[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];
