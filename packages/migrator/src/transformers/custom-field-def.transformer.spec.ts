import { describe, it, expect } from 'vitest';
import { buildCustomFieldDto } from './custom-field-def.transformer';

describe('buildCustomFieldDto', () => {
  it('skips first-class fields (Type/Priority/Assignee by name, State by $type)', () => {
    for (const def of [
      { name: 'Type', ytType: 'SingleEnumIssueCustomField', optionNames: ['Bug'] },
      { name: 'Priority', ytType: 'SingleEnumIssueCustomField', optionNames: ['Critical'] },
      { name: 'Assignee', ytType: 'SingleUserIssueCustomField', optionNames: [] },
      { name: 'State', ytType: 'StateIssueCustomField', optionNames: ['Done'] },
      { name: 'Stage', ytType: 'StateMachineIssueCustomField', optionNames: ['A'] },
    ]) {
      expect(buildCustomFieldDto(def)).toEqual({ kind: 'skip', reason: 'first-class' });
    }
  });

  it('maps a single bundle field to ENUM with its observed options', () => {
    const result = buildCustomFieldDto({
      name: 'Subsystem',
      ytType: 'SingleOwnedIssueCustomField',
      optionNames: ['Backend', 'Frontend'],
    });

    expect(result).toEqual({
      kind: 'create',
      dto: {
        name: 'Subsystem',
        type: 'ENUM',
        config: { type: 'ENUM', options: [{ name: 'Backend' }, { name: 'Frontend' }] },
      },
    });
  });

  it('maps a multi bundle field to MULTI_ENUM', () => {
    const result = buildCustomFieldDto({
      name: 'Platforms',
      ytType: 'MultiEnumIssueCustomField',
      optionNames: ['iOS'],
    });

    expect(result).toMatchObject({ kind: 'create', dto: { type: 'MULTI_ENUM' } });
  });

  it('skips a bundle field that has no observed options (nothing to migrate)', () => {
    const result = buildCustomFieldDto({
      name: 'EmptyEnum',
      ytType: 'SingleEnumIssueCustomField',
      optionNames: [],
    });

    expect(result).toEqual({ kind: 'skip', reason: 'empty-enum' });
  });

  it('maps scalar field types (USER/PERIOD/DATE/TEXT)', () => {
    const cases: Array<[string, string]> = [
      ['SingleUserIssueCustomField', 'USER'],
      ['MultiUserIssueCustomField', 'MULTI_USER'],
      ['PeriodIssueCustomField', 'PERIOD'],
      ['DateIssueCustomField', 'DATE'],
      ['SimpleIssueCustomField', 'TEXT'],
    ];
    for (const [ytType, expected] of cases) {
      const result = buildCustomFieldDto({ name: 'QA Assignee', ytType, optionNames: [] });
      // QA Assignee is not first-class (only "Assignee" is), so it maps.
      expect(result).toMatchObject({ kind: 'create', dto: { type: expected } });
    }
  });

  it('skips an unsupported YouTrack field type', () => {
    const result = buildCustomFieldDto({
      name: 'Weird',
      ytType: 'SomethingUnknownIssueCustomField',
      optionNames: [],
    });

    expect(result).toEqual({ kind: 'skip', reason: 'unsupported' });
  });
});
