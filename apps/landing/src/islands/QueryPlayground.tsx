import { useMemo, useRef, useState, type CSSProperties, type ElementType } from 'react';
import {
  AlertTriangle,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Bug,
  Lightbulb,
  CheckSquare,
  BookOpen,
} from 'lucide-react';
import { Lexer, Parser } from '@repo/shared/query-language';
import type { ParsedQuery, TokenType } from '@repo/shared/query-language';
import { MOCK_ISSUES, type MockIssue } from '../lib/mock-issues';
import { applyQuery } from '../lib/query-evaluator';

const TOKEN_CLASS: Partial<Record<TokenType, string>> = {
  FIELD: 'text-violet-400',
  SORT_BY: 'text-violet-400',
  COLON: 'text-zinc-500',
  COMMA: 'text-zinc-500',
  VALUE: 'text-emerald-300',
  QUOTED_VALUE: 'text-emerald-300',
  KEYWORD: 'text-sky-300',
  HASHTAG: 'text-amber-300',
  NEGATE: 'text-rose-400',
  RANGE_OP: 'text-zinc-500',
  FUZZY: 'text-emerald-300',
  TEXT: 'text-zinc-300',
};

const PRESETS = [
  { label: 'My urgent work', query: 'assignee: me priority: Urgent, High' },
  { label: 'Unresolved bugs, newest first', query: 'type: Bug #unresolved sort by: created desc' },
  { label: 'In review', query: 'status: "In Review" sort by: priority desc' },
  { label: 'Unassigned', query: 'assignee: "{unassigned}"' },
  { label: 'Not done', query: 'status: -Done' },
];

const FIELD_HINTS = ['status:', 'priority:', 'type:', 'assignee:', 'tag:', '#unresolved', 'sort by:'];

interface PriorityConfig {
  icon: ElementType;
  className: string;
}

const PRIORITY_CONFIG: Record<MockIssue['priority'], PriorityConfig> = {
  Urgent: { icon: AlertTriangle, className: 'text-[var(--color-priority-urgent)]' },
  High: { icon: SignalHigh, className: 'text-[var(--color-priority-high)]' },
  Medium: { icon: SignalMedium, className: 'text-[var(--color-priority-medium)]' },
  Low: { icon: SignalLow, className: 'text-[var(--color-priority-low)]' },
};

interface TypeConfig {
  icon: ElementType;
  className: string;
}

const TYPE_CONFIG: Record<MockIssue['type'], TypeConfig> = {
  Bug: { icon: Bug, className: 'text-[var(--color-destructive)]' },
  Feature: { icon: Lightbulb, className: 'text-[var(--color-warning)]' },
  Task: { icon: CheckSquare, className: 'text-[var(--color-info)]' },
  Story: { icon: BookOpen, className: 'text-[var(--color-success)]' },
};

const STATUS_TOKEN: Record<MockIssue['status'], string> = {
  'To Do': 'var(--color-status-todo)',
  'In Progress': 'var(--color-status-in-progress)',
  'In Review': 'var(--color-status-in-review)',
  Done: 'var(--color-status-done)',
};

const TAG_HEX: Record<string, string> = {
  backend: '#3b82f6',
  frontend: '#8b5cf6',
  search: '#eab308',
  docs: '#22c55e',
  realtime: '#ec4899',
  infra: '#f97316',
  api: '#a855f7',
  boards: '#3b82f6',
  'knowledge-base': '#22c55e',
  auth: '#ef4444',
};
const DEFAULT_TAG_HEX = '#6b7280';

function tagHex(tag: string): string {
  return TAG_HEX[tag] ?? DEFAULT_TAG_HEX;
}

interface Segment {
  text: string;
  className: string;
}

function highlightSegments(input: string): Segment[] {
  const tokens = new Lexer(input).tokenize().filter((t) => t.type !== 'EOF');
  if (tokens.length === 0) return [{ text: input, className: '' }];

  const segments: Segment[] = [];
  if (tokens[0].pos > 0) {
    segments.push({ text: input.slice(0, tokens[0].pos), className: '' });
  }
  tokens.forEach((token, i) => {
    const end = tokens[i + 1]?.pos ?? input.length;
    segments.push({
      text: input.slice(token.pos, end),
      className: TOKEN_CLASS[token.type] ?? 'text-zinc-300',
    });
  });
  return segments;
}

function parseQuery(input: string): ParsedQuery {
  return new Parser(new Lexer(input).tokenize()).parse();
}

export default function QueryPlayground() {
  const [query, setQuery] = useState(PRESETS[0].query);
  const highlightRef = useRef<HTMLPreElement>(null);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const results = useMemo(() => applyQuery(MOCK_ISSUES, parsed), [parsed]);
  const segments = useMemo(() => highlightSegments(query), [query]);
  const firstError = parsed.errors[0];

  const syncScroll = (target: HTMLInputElement) => {
    if (highlightRef.current) highlightRef.current.scrollLeft = target.scrollLeft;
  };

  return (
    <div className="border-line bg-panel overflow-hidden rounded-xl border shadow-2xl">
      <div className="border-line border-b p-4 sm:p-5">
        <div className="relative rounded-lg bg-black/30 font-mono text-sm">
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 whitespace-pre"
          >
            {segments.map((seg, i) => (
              <span key={i} className={seg.className}>
                {seg.text}
              </span>
            ))}
          </pre>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              syncScroll(e.target);
            }}
            onScroll={(e) => syncScroll(e.currentTarget)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Search query"
            placeholder="type a query, e.g. status: -Done sort by: priority desc"
            className="caret-fg placeholder:text-fg-muted/50 relative w-full bg-transparent px-4 py-3 whitespace-pre text-transparent outline-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setQuery(preset.query)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                query === preset.query
                  ? 'border-accent/60 bg-accent/15 text-accent-hi'
                  : 'border-line bg-panel-hi text-fg-muted hover:text-fg'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="text-fg-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>Fields:</span>
          {FIELD_HINTS.map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setQuery((q) => (q.trim().length > 0 ? `${q.trim()} ${hint} ` : `${hint} `))}
              className="hover:text-fg font-mono transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
        {firstError && (
          <p className="mt-2 text-xs text-amber-300/90" role="status">
            {firstError.message} — showing best-effort results
          </p>
        )}
      </div>

      <div aria-live="polite">
        <p className="text-fg-muted px-5 pt-3 pb-1 text-xs">
          {results.length} of {MOCK_ISSUES.length} issues
        </p>
        <ul>
          {results.map((issue) => {
            const PriorityIcon = PRIORITY_CONFIG[issue.priority].icon;
            const TypeIcon = TYPE_CONFIG[issue.type].icon;
            return (
              <li
                key={issue.key}
                className="grid grid-cols-[18px_18px_auto_1fr_auto_auto_24px] items-center gap-x-2.5 border-b border-[var(--color-border)] px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-[var(--color-app-accent)]/60"
              >
                <PriorityIcon
                  className={`size-4 ${PRIORITY_CONFIG[issue.priority].className}`}
                  aria-label={`Priority: ${issue.priority}`}
                />
                <TypeIcon
                  className={`size-3.5 ${TYPE_CONFIG[issue.type].className}`}
                  aria-label={issue.type}
                />
                <span className="whitespace-nowrap font-mono text-xs text-[var(--color-fg-muted)]">
                  {issue.key}
                </span>
                <span className="truncate text-sm text-fg">{issue.title}</span>
                <div className="flex items-center gap-1.5">
                  {issue.tags.map((tag) => (
                    <span
                      key={tag}
                      className="tag-badge inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
                      style={{ '--tag': tagHex(tag) } as CSSProperties}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_TOKEN[issue.status] }}
                  />
                  <span className="whitespace-nowrap text-xs font-medium text-[var(--color-fg-muted)]">
                    {issue.status}
                  </span>
                </span>
                {issue.assignee ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-panel-hi text-[11px] font-medium text-fg-muted">
                    {issue.assignee.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <span className="size-6" />
                )}
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="text-fg-muted px-5 py-8 text-center text-sm">
              No issues match this query — try one of the presets above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
