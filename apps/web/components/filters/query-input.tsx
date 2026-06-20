'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Search, HelpCircle } from 'lucide-react';
import { tokenize, TOKEN_CLASSES } from './query-tokenizer';
import { SuggestionPopup } from './suggestion-popup';
import { useAutocomplete } from '@/lib/hooks/use-search';
import type { AutocompleteSuggestion } from '@/lib/api/search.api';
import { cn } from '@/lib/utils';

interface QueryInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onHelpClick?: () => void;
  projectId?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function QueryInput({
  value,
  onChange,
  onSubmit,
  onHelpClick,
  projectId,
  placeholder = 'Search issues... (e.g. status:open priority:high)',
  className,
  autoFocus,
}: QueryInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Local editing buffer. `value` is the parent's rebuilt canonical query; echoing
  // it back while typing would reformat text under the caret, so we adopt it only
  // when the field is not focused (chip removal, clear-all, URL navigation).
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const cursorPos = textareaRef.current?.selectionStart ?? draft.length;

  const { data: suggestions } = useAutocomplete(
    { q: draft, cursor: cursorPos, projectId },
    showSuggestions && draft.length > 0,
  );

  const tokens = useMemo(() => tokenize(draft), [draft]);

  const highlightedHtml = useMemo(() => {
    if (!draft) return '';
    return tokens
      .map((token) => {
        const cls = TOKEN_CLASSES[token.type];
        const escaped = escapeHtml(token.value);
        return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
      })
      .join('');
  }, [tokens, draft]);

  // Sync scroll between textarea and highlight overlay
  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    onChange(e.target.value);
    setShowSuggestions(true);
    setSelectedIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const items = suggestions ?? [];

    if (showSuggestions && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(items[selectedIndex]!);
        return;
      }
    }

    if (e.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setShowSuggestions(false);
      onSubmit?.();
    }
  }

  function applySuggestion(suggestion: AutocompleteSuggestion) {
    // Insert the suggestion at the current cursor position
    const textarea = textareaRef.current;
    if (!textarea) return;

    const pos = textarea.selectionStart;
    const before = draft.slice(0, pos);
    const after = draft.slice(pos);

    // Find the start of the current token being typed
    const tokenStart = findTokenStart(before);
    const prefix = before.slice(0, tokenStart);

    const isField = suggestion.type === 'FIELD';

    let insert = '';
    if (isField) {
      insert = suggestion.label + ':';
    } else if (suggestion.type === 'HASHTAG') {
      insert = suggestion.label;
    } else if (suggestion.label.includes(' ')) {
      insert = `"${suggestion.label}"`;
    } else {
      insert = suggestion.label;
    }

    const rest = after.replace(/^\s+/, '');
    const trailing = rest ? ' ' + rest : isField ? '' : ' ';
    const finalValue = prefix + insert + trailing;
    setDraft(finalValue);
    onChange(finalValue);
    // Keep the popup open after a field so its value suggestions show right away.
    setShowSuggestions(isField);
    setSelectedIndex(0);

    // Refocus
    setTimeout(() => {
      textarea.focus();
      const newPos = prefix.length + insert.length + (isField ? 0 : 1);
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function handleFocus() {
    focusedRef.current = true;
    if (draft.length > 0) {
      setShowSuggestions(true);
    }
  }

  function handleBlur() {
    focusedRef.current = false;
    // Delay to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative flex items-center rounded-lg border border-input bg-background transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent">
        <Search className="ml-3 size-4 text-muted-foreground shrink-0" />

        <div className="relative flex-1 min-w-0">
          {/* Syntax-highlighted overlay */}
          <div
            ref={highlightRef}
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-3 py-2.5 text-sm leading-normal"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: highlightedHtml || `<span class="text-muted-foreground">${escapeHtml(placeholder)}</span>` }}
          />

          {/* Actual textarea (invisible text) */}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            onFocus={handleFocus}
            onBlur={handleBlur}
            rows={1}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-normal text-transparent caret-foreground outline-none"
            spellCheck={false}
            autoFocus={autoFocus}
          />
        </div>

        {onHelpClick && (
          <button
            type="button"
            onClick={onHelpClick}
            className="mr-2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Query syntax help (⌘/)"
          >
            <HelpCircle className="size-4" />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions && suggestions.length > 0 && (
        <SuggestionPopup
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          onSelect={applySuggestion}
        />
      )}
    </div>
  );
}

function findTokenStart(text: string): number {
  // Walk backwards to find the start of the current token
  let i = text.length - 1;
  while (i >= 0 && !/[\s:]/.test(text[i]!)) i--;
  return i + 1;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
