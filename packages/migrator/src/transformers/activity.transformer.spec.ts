import { describe, it, expect } from 'vitest';
import { mapActivity, readableValue } from './activity.transformer';
import { YtActivity } from '../youtrack/types/yt-activity.type';

const author = { id: 'yt-u1', login: 'a', name: 'A' };
const base = (over: Partial<YtActivity>): YtActivity => ({
  id: 'x', $type: 'CustomFieldActivityItem', timestamp: 1533542433142, author, ...over,
});

describe('readableValue', () => {
  it('joins bundle-element names from an array', () => {
    expect(readableValue([{ name: 'Task', $type: 'EnumBundleElement' }])).toBe('Task');
    expect(readableValue([{ name: 'a' }, { name: 'b' }])).toBe('a, b');
  });
  it('handles numbers, strings, users, and empty', () => {
    expect(readableValue(13)).toBe('13');
    expect(readableValue('hi')).toBe('hi');
    expect(readableValue([{ login: 'bob' }])).toBe('bob');
    expect(readableValue([])).toBeNull();
    expect(readableValue(null)).toBeNull();
  });
  it('labels a bare linked issue', () => {
    expect(readableValue([{ $type: 'Issue' }])).toBe('issue');
  });
});

describe('mapActivity', () => {
  it('maps issue creation', () => {
    const m = mapActivity(base({ $type: 'IssueCreatedActivityItem', field: { name: 'created' } }));
    expect(m).toMatchObject({ type: 'ISSUE_CREATED', payload: {}, authorYtId: 'yt-u1' });
  });

  it('maps a State change to FIELD_VALUE_CHANGE with from/to names', () => {
    const m = mapActivity(base({
      field: { name: 'State' },
      removed: [{ name: 'Bug', $type: 'StateBundleElement' }],
      added: [{ name: 'Open', $type: 'StateBundleElement' }],
    }));
    expect(m.type).toBe('FIELD_VALUE_CHANGE');
    expect(m.payload).toEqual({ field: 'State', from: 'Bug', to: 'Open' });
  });

  it('maps a numeric custom field (Story points)', () => {
    const m = mapActivity(base({ field: { name: 'Story points' }, added: 13, removed: null }));
    expect(m.payload).toEqual({ field: 'Story points', from: null, to: '13' });
  });

  it('maps summary/description text edits without dumping the text', () => {
    expect(mapActivity(base({ $type: 'TextMarkupActivityItem', field: { name: 'summary' }, added: 'x', removed: 'y' })))
      .toMatchObject({ type: 'TITLE_CHANGE', payload: {} });
    expect(mapActivity(base({ $type: 'TextMarkupActivityItem', field: { name: 'description' }, added: 'x', removed: 'y' })))
      .toMatchObject({ type: 'DESCRIPTION_CHANGE', payload: {} });
  });

  it('maps a tag addition', () => {
    const m = mapActivity(base({
      $type: 'TagsActivityItem', field: { name: 'tag' },
      added: [{ name: 'NeedsAcknowledgement', $type: 'Tag' }], removed: [],
    }));
    expect(m.payload).toEqual({ field: 'tag', from: null, to: 'NeedsAcknowledgement' });
  });
});
