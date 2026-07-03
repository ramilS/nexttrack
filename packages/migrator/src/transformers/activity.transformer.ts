import { YtActivity } from '../youtrack/types/yt-activity.type';

// The NextTrack ActivityType values the migrator emits. A uniform, low-risk
// subset: created/title/description get dedicated types; every other field
// change becomes FIELD_VALUE_CHANGE with a {field, from, to} payload the
// (enhanced) frontend renders as "changed {field}: {from} → {to}". Mapping each
// YouTrack field to a bespoke type/payload shape is fragile — the frontend's
// per-type renderers expect exact shapes — so we deliberately don't.
export type MigrationActivityType =
  | 'ISSUE_CREATED'
  | 'TITLE_CHANGE'
  | 'DESCRIPTION_CHANGE'
  | 'FIELD_VALUE_CHANGE';

export interface MappedActivity {
  type: MigrationActivityType;
  payload: Record<string, unknown>;
  authorYtId: string | undefined;
  timestamp: number;
}

// Human-readable rendering of an added/removed value across YouTrack's shapes.
export function readableValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((el) => elementLabel(el))
      .filter((s): s is string => s !== null);
    return parts.length ? parts.join(', ') : null;
  }
  return elementLabel(value);
}

function elementLabel(el: unknown): string | null {
  if (el === null || el === undefined) return null;
  if (typeof el === 'string') return el.trim() || null;
  if (typeof el === 'object') {
    const o = el as { name?: unknown; login?: unknown; text?: unknown; $type?: unknown };
    if (typeof o.name === 'string') return o.name;
    if (typeof o.login === 'string') return o.login;
    if (typeof o.text === 'string') return o.text;
    // A bare linked issue ({$type:'Issue'}) with no fetched name.
    if (o.$type === 'Issue') return 'issue';
    return null;
  }
  return String(el);
}

// TextMarkupActivityItem before/after is the field's markup, shaped as a raw
// string, a {text}/{markup} object, or a single-element array of those. Returns
// '' (not null) for an empty side so a diff still renders (e.g. first draft).
function markupText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(markupText).join('');
  if (typeof value === 'object') {
    const o = value as { text?: unknown; markup?: unknown };
    if (typeof o.text === 'string') return o.text;
    if (typeof o.markup === 'string') return o.markup;
  }
  return '';
}

export function mapActivity(activity: YtActivity): MappedActivity {
  const base = {
    authorYtId: activity.author?.id,
    timestamp: activity.timestamp,
  };
  const field = activity.field?.name ?? '';

  if (activity.$type === 'IssueCreatedActivityItem') {
    return { ...base, type: 'ISSUE_CREATED', payload: {} };
  }
  if (activity.$type === 'TextMarkupActivityItem') {
    // Carry the before/after markup so the UI can render a word-level diff
    // (YouTrack shows a red/green diff for description/summary edits). This text
    // is historical — it is NOT recoverable from the current issue value — so it
    // must live in the payload.
    const payload = { from: markupText(activity.removed), to: markupText(activity.added) };
    return field === 'summary'
      ? { ...base, type: 'TITLE_CHANGE', payload }
      : { ...base, type: 'DESCRIPTION_CHANGE', payload };
  }

  return {
    ...base,
    type: 'FIELD_VALUE_CHANGE',
    payload: {
      field: field || 'field',
      from: readableValue(activity.removed),
      to: readableValue(activity.added),
    },
  };
}
