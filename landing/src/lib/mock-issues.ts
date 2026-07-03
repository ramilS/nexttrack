export interface MockIssue {
  key: string;
  title: string;
  type: 'Bug' | 'Feature' | 'Task' | 'Story';
  status: 'To Do' | 'In Progress' | 'In Review' | 'Done';
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  assignee: string | null;
  tags: string[];
  createdDaysAgo: number;
  updatedDaysAgo: number;
}

export const CURRENT_USER = 'alex';

export const MOCK_ISSUES: MockIssue[] = [
  { key: 'NT-101', title: 'Fix N+1 query in board loading', type: 'Bug', status: 'In Progress', priority: 'High', assignee: 'alex', tags: ['backend'], createdDaysAgo: 2, updatedDaysAgo: 0 },
  { key: 'NT-102', title: 'Add keyboard shortcuts to issue list', type: 'Feature', status: 'To Do', priority: 'Medium', assignee: 'mira', tags: ['frontend'], createdDaysAgo: 5, updatedDaysAgo: 1 },
  { key: 'NT-103', title: 'Elasticsearch reindex drops custom fields', type: 'Bug', status: 'In Review', priority: 'Urgent', assignee: 'alex', tags: ['backend', 'search'], createdDaysAgo: 1, updatedDaysAgo: 0 },
  { key: 'NT-104', title: 'Update self-hosting guide', type: 'Task', status: 'To Do', priority: 'Low', assignee: null, tags: ['docs'], createdDaysAgo: 12, updatedDaysAgo: 4 },
  { key: 'NT-105', title: 'Redesign sprint planning view', type: 'Story', status: 'In Progress', priority: 'High', assignee: 'dana', tags: ['frontend'], createdDaysAgo: 7, updatedDaysAgo: 1 },
  { key: 'NT-106', title: 'Dark theme contrast on status badges', type: 'Bug', status: 'Done', priority: 'Medium', assignee: 'mira', tags: ['frontend'], createdDaysAgo: 9, updatedDaysAgo: 2 },
  { key: 'NT-107', title: 'Live cursors in issue editor', type: 'Feature', status: 'To Do', priority: 'Urgent', assignee: 'alex', tags: ['realtime'], createdDaysAgo: 3, updatedDaysAgo: 1 },
  { key: 'NT-108', title: 'Upgrade Postgres to 16', type: 'Task', status: 'Done', priority: 'Medium', assignee: 'dana', tags: ['infra'], createdDaysAgo: 20, updatedDaysAgo: 6 },
  { key: 'NT-109', title: 'Webhook retries duplicate deliveries', type: 'Bug', status: 'To Do', priority: 'High', assignee: null, tags: ['api'], createdDaysAgo: 4, updatedDaysAgo: 2 },
  { key: 'NT-110', title: 'Swimlane grouping by assignee', type: 'Feature', status: 'In Progress', priority: 'Low', assignee: 'mira', tags: ['boards'], createdDaysAgo: 6, updatedDaysAgo: 0 },
  { key: 'NT-111', title: 'Article version history', type: 'Story', status: 'In Review', priority: 'Medium', assignee: 'dana', tags: ['knowledge-base'], createdDaysAgo: 8, updatedDaysAgo: 3 },
  { key: 'NT-112', title: 'Refresh token race on multi-tab logout', type: 'Bug', status: 'In Progress', priority: 'Urgent', assignee: 'alex', tags: ['auth'], createdDaysAgo: 0, updatedDaysAgo: 0 },
];

export type BoardColumnName = 'To Do' | 'In Progress' | 'Done';

export const BOARD_INITIAL_COLUMNS: Record<BoardColumnName, string[]> = {
  'To Do': ['NT-102', 'NT-107', 'NT-104'],
  'In Progress': ['NT-101', 'NT-110'],
  Done: ['NT-106'],
};
