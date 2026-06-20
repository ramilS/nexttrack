'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/shared/kbd';

interface SyntaxHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SECTIONS = [
  {
    title: 'Field Filters',
    items: [
      { syntax: 'status:open', desc: 'Filter by status' },
      { syntax: 'priority:high,urgent', desc: 'Multiple values (comma-separated)' },
      { syntax: 'assignee:{me}', desc: 'Assigned to current user' },
      { syntax: 'assignee:"John Doe"', desc: 'Quoted value for spaces' },
      { syntax: '-status:cancelled', desc: 'Negation (exclude)' },
      { syntax: 'tag:bug-fix', desc: 'Filter by tag name' },
    ],
  },
  {
    title: 'Available Fields',
    items: [
      { syntax: 'assignee, reporter', desc: 'User fields' },
      { syntax: 'status, priority, type', desc: 'Issue fields' },
      { syntax: 'tag, project', desc: 'Classification fields' },
      { syntax: 'created, updated, resolved', desc: 'Date fields' },
      { syntax: 'due date, estimate, spent', desc: 'Planning fields' },
      { syntax: '{Custom Field Name}:value', desc: 'Custom fields (in braces)' },
    ],
  },
  {
    title: 'Date Ranges',
    items: [
      { syntax: 'created:today', desc: 'Created today' },
      { syntax: 'created:-7d', desc: 'Created in the last 7 days' },
      { syntax: 'updated:today..+7d', desc: 'Updated today through next 7 days' },
      { syntax: 'created:2026-01-01..2026-03-08', desc: 'Explicit date range' },
    ],
  },
  {
    title: 'Hashtag Presets',
    items: [
      { syntax: '#MyIssues', desc: 'Assigned to me' },
      { syntax: '#Unresolved', desc: 'Not yet resolved' },
      { syntax: '#Overdue', desc: 'Past due date' },
      { syntax: '#Unassigned', desc: 'No assignee' },
    ],
  },
  {
    title: 'Text Search',
    items: [
      { syntax: 'login bug', desc: 'Free text search (title, description, comments)' },
      { syntax: '"exact phrase"', desc: 'Phrase search' },
      { syntax: '~fuzzy', desc: 'Fuzzy matching' },
    ],
  },
  {
    title: 'Sorting',
    items: [
      { syntax: 'sort:created:desc', desc: 'Sort by created date, newest first' },
      { syntax: 'sort:priority:asc', desc: 'Sort by priority, lowest first' },
    ],
  },
];

export function SyntaxHelpDialog({ open, onOpenChange }: SyntaxHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Query Syntax Reference
            <Kbd keys={['\u2318', '/']} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <div key={item.syntax} className="flex items-start gap-3">
                    <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {item.syntax}
                    </code>
                    <span className="text-xs text-muted-foreground">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Combining
            </h3>
            <p className="text-xs text-muted-foreground">
              All filters are combined with AND logic. Example:
            </p>
            <code className="mt-1.5 block rounded bg-muted p-2 text-xs font-mono">
              status:open priority:high assignee:{'{me}'} sort:updated:desc
            </code>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
