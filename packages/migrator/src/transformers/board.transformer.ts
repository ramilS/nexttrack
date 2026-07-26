import type { YtAgileBoard, YtAgileSprint } from '../youtrack/types/yt-agile.type';

export type MigratedSprintStatus = 'PLANNING' | 'ACTIVE' | 'CLOSED';

export interface MigratedBoardColumn {
  id: string;
  name: string;
  statusIds: string[];
  ordinal: number;
}

// Rebuild the board's columns from YouTrack's columnSettings so the target
// board matches the source layout (separate "To Verify" / "In Review" columns,
// etc.) instead of the default 3-column fallback. Each YouTrack column maps its
// State field values to target workflow status ids BY NAME (via resolveStatusId,
// backed by the status id-map).
//
// Columns whose states resolve to no target status are dropped. Statuses with
// no column are intentionally left uncovered — their issues stay hidden from the
// board, mirroring YouTrack, where a state without a column (e.g. Released) is
// not shown. NB: the target's public column editor requires every status to be
// covered; the importer must persist these via the migration-only setter.
export function buildBoardColumns(
  board: YtAgileBoard,
  resolveStatusId: (stateName: string) => string | null,
): MigratedBoardColumn[] {
  const columns: MigratedBoardColumn[] = [];
  const usedStatusIds = new Set<string>();

  for (const col of board.columnSettings?.columns ?? []) {
    const statusIds: string[] = [];
    for (const fieldValue of col.fieldValues ?? []) {
      const statusId = resolveStatusId(fieldValue.name);
      // A status can only live in one column (target invariant) — first wins.
      if (statusId && !usedStatusIds.has(statusId)) {
        statusIds.push(statusId);
        usedStatusIds.add(statusId);
      }
    }
    if (statusIds.length === 0) continue;

    const ordinal = columns.length;
    columns.push({
      id: `${slugify(col.presentation) || 'col'}-${ordinal}`,
      name: col.presentation,
      statusIds,
      ordinal,
    });
  }

  return columns;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// YouTrack sprints only expose `archived`; the current sprint is named
// explicitly by the agile's `currentSprint`. Map to the target lifecycle:
//   archived                    → CLOSED   (hidden from the default board view,
//                                           shown under the picker's Closed group)
//   the current open sprint     → ACTIVE   (the board opens on this one)
//   every other open sprint     → PLANNING
// "Current" is YouTrack's currentSprint when it is open; otherwise the open
// sprint whose [start, finish] contains `now`, else the latest-starting one.
// Yields AT MOST ONE ACTIVE per board (the single-active invariant enforced by
// SprintsService.start) and none when every sprint is archived.
export function resolveSprintStatuses(
  sprints: YtAgileSprint[],
  now: Date,
  currentSprintId?: string | null,
): Map<string, MigratedSprintStatus> {
  const open = sprints.filter((s) => !s.archived);
  const activeId = pickActiveSprintId(open, now.getTime(), currentSprintId);

  const statuses = new Map<string, MigratedSprintStatus>();
  for (const s of sprints) {
    if (s.archived) statuses.set(s.id, 'CLOSED');
    else if (s.id === activeId) statuses.set(s.id, 'ACTIVE');
    else statuses.set(s.id, 'PLANNING');
  }
  return statuses;
}

function pickActiveSprintId(
  open: YtAgileSprint[],
  nowMs: number,
  currentSprintId?: string | null,
): string | null {
  if (open.length === 0) return null;

  // Prefer YouTrack's own "current sprint" pointer when it is an open sprint.
  if (currentSprintId && open.some((s) => s.id === currentSprintId)) {
    return currentSprintId;
  }

  const containingNow = open.filter(
    (s) => s.start != null && s.finish != null && s.start <= nowMs && nowMs <= s.finish,
  );
  const pool = containingNow.length > 0 ? containingNow : open;

  return pool.reduce((latest, s) =>
    (s.start ?? -Infinity) > (latest.start ?? -Infinity) ? s : latest,
  ).id;
}
