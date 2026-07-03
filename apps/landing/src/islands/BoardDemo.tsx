import { useEffect, useRef, useState } from 'react';
import {
  BOARD_INITIAL_COLUMNS,
  MOCK_ISSUES,
  type BoardColumnName,
  type MockIssue,
} from '../lib/mock-issues';

const COLUMN_ORDER: BoardColumnName[] = ['To Do', 'In Progress', 'Done'];
const AUTOPLAY_CARD = 'NT-101';
const AUTOPLAY_FROM: BoardColumnName = 'In Progress';
const AUTOPLAY_TO: BoardColumnName = 'Done';

const PRIORITY_BORDER: Record<MockIssue['priority'], string> = {
  Urgent: 'border-l-rose-500',
  High: 'border-l-orange-400',
  Medium: 'border-l-amber-300',
  Low: 'border-l-sky-400',
};

type Columns = Record<BoardColumnName, string[]>;

interface CursorState {
  x: number;
  y: number;
  pressed: boolean;
  visible: boolean;
}

interface UserDrag {
  key: string;
  from: BoardColumnName;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

const issueByKey = new Map(MOCK_ISSUES.map((issue) => [issue.key, issue]));

function moveCard(columns: Columns, key: string, from: BoardColumnName, to: BoardColumnName): Columns {
  if (from === to) return columns;
  return {
    ...columns,
    [from]: columns[from].filter((k) => k !== key),
    [to]: [...columns[to], key],
  };
}

function sleep(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms)).then(() => {
    if (signal.cancelled) throw new Error('cancelled');
  });
}

export default function BoardDemo() {
  const [columns, setColumns] = useState<Columns>(BOARD_INITIAL_COLUMNS);
  const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, pressed: false, visible: false });
  const [ghostKey, setGhostKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [userTookOver, setUserTookOver] = useState(false);
  const [drag, setDrag] = useState<UserDrag | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const columnRefs = useRef(new Map<BoardColumnName, HTMLDivElement>());
  const dragRef = useRef<UserDrag | null>(null);
  dragRef.current = drag;

  const relativeCenter = (el: Element) => {
    const container = containerRef.current!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left - container.left + rect.width / 2,
      y: rect.top - container.top + rect.height / 2,
    };
  };

  useEffect(() => {
    if (userTookOver) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const signal = { cancelled: false };

    const runLoop = async () => {
      // Initial delay lets the island settle after client:visible hydration.
      await sleep(1200, signal);
      for (;;) {
        const card = cardRefs.current.get(AUTOPLAY_CARD);
        const target = columnRefs.current.get(AUTOPLAY_TO);
        if (!card || !target || !containerRef.current) return;

        const start = relativeCenter(card);
        const end = relativeCenter(target);

        setCursor({ x: start.x + 120, y: start.y + 80, pressed: false, visible: true });
        await sleep(700, signal);
        setCursor({ x: start.x, y: start.y, pressed: false, visible: true });
        await sleep(800, signal);
        setCursor({ x: start.x, y: start.y, pressed: true, visible: true });
        setGhostKey(AUTOPLAY_CARD);
        await sleep(350, signal);
        setCursor({ x: end.x, y: end.y, pressed: true, visible: true });
        await sleep(950, signal);
        setGhostKey(null);
        setCursor({ x: end.x, y: end.y, pressed: false, visible: true });
        setColumns((cols) => moveCard(cols, AUTOPLAY_CARD, AUTOPLAY_FROM, AUTOPLAY_TO));
        setToast(`Alex moved ${AUTOPLAY_CARD} to ${AUTOPLAY_TO}`);
        await sleep(2400, signal);
        setToast(null);
        setCursor((c) => ({ ...c, visible: false }));
        await sleep(1600, signal);
        setColumns(BOARD_INITIAL_COLUMNS);
        await sleep(1400, signal);
      }
    };

    runLoop().catch(() => undefined); // 'cancelled' rejection is the intended exit path

    return () => {
      signal.cancelled = true;
    };
  }, [userTookOver]);

  const columnAtPoint = (clientX: number, clientY: number): BoardColumnName | null => {
    for (const [name, el] of columnRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return name;
      }
    }
    return null;
  };

  const onCardPointerDown = (event: React.PointerEvent, key: string, from: BoardColumnName) => {
    event.preventDefault();
    setUserTookOver(true);
    setGhostKey(null);
    setCursor((c) => ({ ...c, visible: false }));
    const container = containerRef.current!.getBoundingClientRect();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({
      key,
      from,
      x: event.clientX - container.left,
      y: event.clientY - container.top,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const containerEl = containerRef.current;
      if (!containerEl) return;
      const container = containerEl.getBoundingClientRect();
      setDrag((d) => (d ? { ...d, x: event.clientX - container.left, y: event.clientY - container.top } : d));
    };
    const onUp = (event: PointerEvent) => {
      const current = dragRef.current;
      if (current) {
        const target = columnAtPoint(event.clientX, event.clientY);
        if (target) {
          setColumns((cols) => moveCard(cols, current.key, current.from, target));
          if (target !== current.from) setToast(`You moved ${current.key} to ${target}`);
          setTimeout(() => setToast(null), 2200);
        }
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // Re-bind window listeners only on the null <-> active drag transition; per-move
    // updates read the latest drag state via dragRef, so `drag` itself isn't a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const renderCard = (key: string, column: BoardColumnName, hidden: boolean) => {
    const issue = issueByKey.get(key);
    if (!issue) return null;
    return (
      <div
        key={key}
        ref={(el) => {
          if (el) cardRefs.current.set(key, el);
        }}
        onPointerDown={(event) => onCardPointerDown(event, key, column)}
        className={`border-line bg-panel-hi cursor-grab touch-none rounded-lg border border-l-2 p-3 select-none ${PRIORITY_BORDER[issue.priority]} ${hidden ? 'opacity-30' : ''}`}
      >
        <p className="text-fg-muted font-mono text-xs">{issue.key}</p>
        <p className="mt-1 text-sm leading-snug">{issue.title}</p>
      </div>
    );
  };

  const ghostIssue = ghostKey ? issueByKey.get(ghostKey) : null;
  const dragIssue = drag ? issueByKey.get(drag.key) : null;

  return (
    <div ref={containerRef} className="border-line bg-panel relative overflow-hidden rounded-xl border p-4 shadow-2xl">
      <div className="grid grid-cols-3 gap-3">
        {COLUMN_ORDER.map((name) => (
          <div
            key={name}
            ref={(el) => {
              if (el) columnRefs.current.set(name, el);
            }}
            className="rounded-lg bg-black/20 p-2.5"
          >
            <p className="text-fg-muted px-1 pb-2 text-xs font-semibold tracking-wide uppercase">
              {name} <span className="ml-1 font-normal">{columns[name].length}</span>
            </p>
            <div className="flex min-h-24 flex-col gap-2">
              {columns[name].map((key) =>
                renderCard(key, name, ghostKey === key || drag?.key === key),
              )}
            </div>
          </div>
        ))}
      </div>

      {ghostIssue && (
        <div
          aria-hidden="true"
          className={`border-line bg-panel-hi pointer-events-none absolute z-10 w-40 rotate-2 rounded-lg border border-l-2 p-3 shadow-xl transition-all duration-[950ms] ease-in-out ${PRIORITY_BORDER[ghostIssue.priority]}`}
          style={{ left: cursor.x - 80, top: cursor.y - 20 }}
        >
          <p className="text-fg-muted font-mono text-xs">{ghostIssue.key}</p>
          <p className="mt-1 text-sm leading-snug">{ghostIssue.title}</p>
        </div>
      )}

      {dragIssue && drag && (
        <div
          aria-hidden="true"
          className={`border-line bg-panel-hi pointer-events-none absolute z-10 w-40 rotate-2 rounded-lg border border-l-2 p-3 shadow-xl ${PRIORITY_BORDER[dragIssue.priority]}`}
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
        >
          <p className="text-fg-muted font-mono text-xs">{dragIssue.key}</p>
          <p className="mt-1 text-sm leading-snug">{dragIssue.title}</p>
        </div>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute z-20 transition-all duration-700 ease-in-out ${cursor.visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: cursor.x, top: cursor.y }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" className={cursor.pressed ? 'scale-90' : ''}>
          <path d="M5 3l14 8-6.5 1.5L9 19z" fill="var(--color-accent-hi)" stroke="white" strokeWidth={1.5} />
        </svg>
        <span className="bg-accent mt-0.5 ml-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white">
          Alex
        </span>
      </div>

      <div
        role="status"
        className={`border-line bg-panel-hi absolute right-4 bottom-4 z-20 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-xl transition-all duration-300 ${toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      >
        <span className="bg-accent flex size-6 items-center justify-center rounded-full text-xs font-bold text-white">
          A
        </span>
        {toast}
      </div>
    </div>
  );
}
