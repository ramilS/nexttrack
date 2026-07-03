import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyScore } from '../lib/fuzzy';

const REPO_URL = 'https://github.com/ramilS/nexttrack';

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
}

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<Element | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

  const commands = useMemo<Command[]>(
    () => [
      { id: 'features', label: 'Go to Features', hint: 'Section', run: () => scrollToSection('features') },
      { id: 'query', label: 'Go to Query language', hint: 'Section', run: () => scrollToSection('query-language') },
      { id: 'board', label: 'Go to Board & real-time demo', hint: 'Section', run: () => scrollToSection('board') },
      { id: 'selfhost', label: 'Go to Self-host guide', hint: 'Section', run: () => scrollToSection('self-host') },
      {
        id: 'clone',
        label: 'Copy git clone command',
        hint: 'Clipboard',
        run: async () => {
          await navigator.clipboard.writeText(`git clone ${REPO_URL}.git`);
          setFeedback('Copied to clipboard');
        },
      },
      { id: 'github', label: 'Open GitHub repo', hint: 'Link', run: () => window.open(REPO_URL, '_blank', 'noopener') },
      { id: 'star', label: 'Star on GitHub', hint: 'Link', run: () => window.open(REPO_URL, '_blank', 'noopener') },
    ],
    [],
  );

  const matches = useMemo(() => {
    return commands
      .map((command) => ({ command, score: fuzzyScore(search, command.label) }))
      .filter((m): m is { command: Command; score: number } => m.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.command);
  }, [commands, search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    const onOpenEvent = () => setIsOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('nexttrack:open-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('nexttrack:open-palette', onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement;
      setSearch('');
      setActiveIndex(0);
      setFeedback(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (previousFocus.current instanceof HTMLElement) {
      previousFocus.current.focus();
    }
  }, [isOpen]);

  useEffect(() => setActiveIndex(0), [search]);

  const runCommand = async (command: Command) => {
    await command.run();
    if (command.id === 'clone') {
      setTimeout(close, 700);
    } else {
      close();
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && matches[activeIndex]) {
      event.preventDefault();
      void runCommand(matches[activeIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[18vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="border-line bg-panel w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          className="border-line placeholder:text-fg-muted/60 w-full border-b bg-transparent px-4 py-3.5 text-sm outline-none"
        />
        <ul role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto py-2">
          {matches.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={() => void runCommand(command)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                  index === activeIndex ? 'bg-accent/15 text-fg' : 'text-fg-muted'
                }`}
              >
                <span>{command.label}</span>
                <span className="text-fg-muted text-xs">{command.hint}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="text-fg-muted px-4 py-6 text-center text-sm">No matching commands</li>
          )}
        </ul>
        <div className="border-line text-fg-muted flex items-center justify-between border-t px-4 py-2 text-xs">
          {feedback ?? (
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">↵</kbd> run ·{' '}
              <kbd className="font-mono">esc</kbd> close
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
