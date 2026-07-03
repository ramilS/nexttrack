import { useMemo, useRef, useState } from 'react';
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

const PRIORITY_BAR: Record<MockIssue['priority'], string> = {
  Urgent: 'bg-rose-500',
  High: 'bg-orange-400',
  Medium: 'bg-amber-300',
  Low: 'bg-sky-400',
};

const STATUS_CLASS: Record<MockIssue['status'], string> = {
  'To Do': 'bg-zinc-500/20 text-zinc-300',
  'In Progress': 'bg-blue-500/20 text-blue-300',
  'In Review': 'bg-violet-500/20 text-violet-300',
  Done: 'bg-emerald-500/20 text-emerald-300',
};

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
          {results.map((issue) => (
            <li
              key={issue.key}
              className="border-line/60 grid grid-cols-[4px_auto_1fr_auto] items-center gap-x-3 border-b px-5 py-2.5 text-sm last:border-b-0 sm:grid-cols-[4px_auto_1fr_auto_auto_auto]"
            >
              <span className={`h-4 w-1 rounded-full ${PRIORITY_BAR[issue.priority]}`} aria-hidden="true" />
              <span className="text-fg-muted font-mono text-xs">{issue.key}</span>
              <span className="truncate">{issue.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[issue.status]}`}>
                {issue.status}
              </span>
              <span className="text-fg-muted hidden text-xs sm:block">
                {issue.assignee ?? '—'}
              </span>
              <span className="text-fg-muted hidden font-mono text-xs sm:block">
                {issue.tags.map((t) => `#${t}`).join(' ')}
              </span>
            </li>
          ))}
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
