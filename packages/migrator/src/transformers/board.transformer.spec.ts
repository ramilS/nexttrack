import { describe, it, expect } from 'vitest';
import { buildBoardColumns, resolveSprintStatuses } from './board.transformer';
import type { YtAgileBoard, YtAgileSprint } from '../youtrack/types/yt-agile.type';

const NOW = new Date('2026-07-05T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function board(overrides: Partial<YtAgileBoard> = {}): YtAgileBoard {
  return { id: 'b1', name: 'Board', ...overrides };
}

function sprint(overrides: Partial<YtAgileSprint> = {}): YtAgileSprint {
  return { id: 's1', name: 'Sprint', ...overrides };
}

describe('buildBoardColumns', () => {
  // Mirrors the real UDSAPP workflow: To Verify / In Review exist as their own
  // statuses; Released has no YouTrack column.
  const STATUS_IDS: Record<string, string> = {
    Open: 'st-open',
    'In Progress': 'st-prog',
    'In Review': 'st-review',
    'To Verify': 'st-verify',
    Done: 'st-done',
  };
  const resolve = (name: string) => STATUS_IDS[name] ?? null;

  const theOffice = board({
    columnSettings: {
      columns: [
        { presentation: 'Open', fieldValues: [{ name: 'Open' }] },
        { presentation: 'In Progress', fieldValues: [{ name: 'In Progress' }] },
        { presentation: 'In Review', fieldValues: [{ name: 'In Review' }] },
        { presentation: 'To Verify', fieldValues: [{ name: 'To Verify' }] },
        { presentation: 'Done', fieldValues: [{ name: 'Done' }] },
      ],
    },
  });

  it('rebuilds one target column per YouTrack column, preserving order', () => {
    const columns = buildBoardColumns(theOffice, resolve);
    expect(columns.map((c) => c.name)).toEqual([
      'Open',
      'In Progress',
      'In Review',
      'To Verify',
      'Done',
    ]);
    expect(columns.map((c) => c.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(columns[3]).toMatchObject({ name: 'To Verify', statusIds: ['st-verify'] });
  });

  it('maps a column with several state values to several status ids', () => {
    const columns = buildBoardColumns(
      board({
        columnSettings: {
          columns: [
            { presentation: 'Done', fieldValues: [{ name: 'Done' }, { name: 'In Review' }] },
          ],
        },
      }),
      resolve,
    );
    expect(columns[0].statusIds).toEqual(['st-done', 'st-review']);
  });

  it('drops a column whose states do not resolve to any target status', () => {
    const columns = buildBoardColumns(
      board({
        columnSettings: {
          columns: [
            { presentation: 'Open', fieldValues: [{ name: 'Open' }] },
            { presentation: 'Released', fieldValues: [{ name: 'Released' }] },
          ],
        },
      }),
      resolve,
    );
    expect(columns.map((c) => c.name)).toEqual(['Open']);
  });

  it('never assigns the same status to two columns', () => {
    const columns = buildBoardColumns(
      board({
        columnSettings: {
          columns: [
            { presentation: 'A', fieldValues: [{ name: 'Open' }] },
            { presentation: 'B', fieldValues: [{ name: 'Open' }, { name: 'Done' }] },
          ],
        },
      }),
      resolve,
    );
    expect(columns[0].statusIds).toEqual(['st-open']);
    expect(columns[1].statusIds).toEqual(['st-done']);
  });

  it('returns no columns when the board has no columnSettings', () => {
    expect(buildBoardColumns(board(), resolve)).toEqual([]);
  });

  it('generates unique, schema-valid column ids', () => {
    const columns = buildBoardColumns(theOffice, resolve);
    const ids = columns.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });
});

describe('resolveSprintStatuses', () => {
  it('maps archived sprints to CLOSED', () => {
    const statuses = resolveSprintStatuses(
      [sprint({ id: 'old', archived: true }), sprint({ id: 'cur', archived: false })],
      NOW,
    );
    expect(statuses.get('old')).toBe('CLOSED');
  });

  it('prefers YouTrack currentSprint for ACTIVE over the date heuristic', () => {
    const statuses = resolveSprintStatuses(
      [
        sprint({ id: 'dated', start: NOW.getTime() - 2 * DAY, finish: NOW.getTime() + 2 * DAY }),
        sprint({ id: 'current' }),
      ],
      NOW,
      'current',
    );
    expect(statuses.get('current')).toBe('ACTIVE');
    expect(statuses.get('dated')).toBe('PLANNING');
  });

  it('ignores currentSprint when it points at an archived sprint, falling back to dates', () => {
    const statuses = resolveSprintStatuses(
      [
        sprint({ id: 'archived', archived: true }),
        sprint({ id: 'open', start: NOW.getTime() - 1 * DAY, finish: NOW.getTime() + 1 * DAY }),
      ],
      NOW,
      'archived',
    );
    expect(statuses.get('archived')).toBe('CLOSED');
    expect(statuses.get('open')).toBe('ACTIVE');
  });

  it('marks the sprint whose date range contains now as ACTIVE (no currentSprint)', () => {
    const statuses = resolveSprintStatuses(
      [
        sprint({ id: 'past', start: NOW.getTime() - 30 * DAY, finish: NOW.getTime() - 20 * DAY }),
        sprint({ id: 'current', start: NOW.getTime() - 2 * DAY, finish: NOW.getTime() + 5 * DAY }),
      ],
      NOW,
    );
    expect(statuses.get('current')).toBe('ACTIVE');
    expect(statuses.get('past')).toBe('PLANNING');
  });

  it('never marks more than one ACTIVE', () => {
    const statuses = resolveSprintStatuses(
      [
        sprint({ id: 'a', start: NOW.getTime() - 3 * DAY, finish: NOW.getTime() + 3 * DAY }),
        sprint({ id: 'b', start: NOW.getTime() - 1 * DAY, finish: NOW.getTime() + 1 * DAY }),
      ],
      NOW,
    );
    expect([...statuses.values()].filter((s) => s === 'ACTIVE')).toHaveLength(1);
  });

  it('marks no sprint ACTIVE when every sprint is archived', () => {
    const statuses = resolveSprintStatuses(
      [sprint({ id: 'a', archived: true }), sprint({ id: 'b', archived: true })],
      NOW,
      'a',
    );
    expect([...statuses.values()]).toEqual(['CLOSED', 'CLOSED']);
  });
});
