import type { ReactNode } from 'react';
import type { IssueDetail } from '@repo/shared/schemas';
import type { CurrentUser } from '@/lib/stores/auth.store';

export interface CommandOption {
  id: string;
  label: string;
  icon?: ReactNode;
  keywords?: string[];
  color?: string;
}

export interface Command {
  id: string;
  label: string;
  icon?: ReactNode;
  keywords?: string[];
  group: 'issue' | 'navigation' | 'application';
  /** Return false to hide command in current context */
  when?: (ctx: CommandContext) => boolean;
  /** If present, entering this command opens a sub-option picker */
  getOptions?: (ctx: CommandContext) => CommandOption[];
  /** Execute the command (with optional selected sub-option) */
  execute: (ctx: CommandContext, optionId?: string) => void;
  shortcut?: string;
  /** Extra metadata for rendering (e.g., project color) */
  meta?: Record<string, string>;
}

export interface CommandContext {
  activeIssue: IssueDetail | null;
  selectedIssueIds: string[];
  currentProject: { key: string; id: string } | null;
  currentUser: CurrentUser | null;
}
