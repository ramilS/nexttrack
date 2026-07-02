import { YtCustomField } from '../youtrack/types/yt-issue.type';

// YouTrack exposes Type/State/Assignee/Priority as custom fields, but in
// NextTrack they are first-class Issue attributes (type, statusId, assigneeId,
// priority) handled by dedicated transformer paths. They must NOT be
// auto-created as custom fields, nor mapped as generic custom-field values.
//
// State is matched by $type (its field can be renamed per project); Type,
// Priority and Assignee by their conventional YouTrack names.
export const FIRST_CLASS_FIELD_NAMES = new Set(['Type', 'Priority', 'Assignee']);
export const FIRST_CLASS_FIELD_TYPES = new Set([
  'StateIssueCustomField',
  'StateMachineIssueCustomField',
]);

export function ytFieldType(field: Pick<YtCustomField, '$type' | 'type'>): string {
  return field.$type ?? field.type ?? '';
}

export function isFirstClassField(
  field: Pick<YtCustomField, 'name' | '$type' | 'type'>,
): boolean {
  return (
    FIRST_CLASS_FIELD_NAMES.has(field.name) ||
    FIRST_CLASS_FIELD_TYPES.has(ytFieldType(field))
  );
}
