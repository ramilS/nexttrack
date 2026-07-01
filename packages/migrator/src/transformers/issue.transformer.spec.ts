import { describe, it, expect, vi } from 'vitest';
import { IssueTransformer } from './issue.transformer';
import { IdMapService } from '../id-map/id-map.service';
import { YtIssue } from '../youtrack/types/yt-issue.type';

function buildYtIssue(overrides: Partial<YtIssue> = {}): YtIssue {
  return {
    id: 'yt-1',
    numberInProject: 1,
    summary: 'Test issue',
    created: 1_700_000_000_000,
    updated: 1_700_000_000_000,
    reporter: { id: 'yt-user-1', login: 'reporter' },
    ...overrides,
  };
}

function idMapWithReporter(): IdMapService {
  const idMap = new IdMapService();
  idMap.registerUser('yt-user-1', 'nt-user-1');
  return idMap;
}

const statusMap = new Map<string, string>([['Open', 'status-open']]);

describe('IssueTransformer custom-field mapping', () => {
  it('drops a custom field with no target mapping and reports it', () => {
    const sink = vi.fn();
    const transformer = new IssueTransformer(sink);
    const issue = buildYtIssue({
      customFields: [
        { name: 'Sprint Points', value: { text: '5' }, $type: 'TextIssueCustomField' },
      ],
    });

    const dto = transformer.transform(issue, idMapWithReporter(), statusMap);

    expect(dto.fieldValues).toEqual([]);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({ name: 'Sprint Points', reason: 'no-field-mapping' });
  });

  it('maps a known enum custom field to its target option', () => {
    const sink = vi.fn();
    const transformer = new IssueTransformer(sink);
    const idMap = idMapWithReporter();
    idMap.registerCustomField('Severity', 'nt-field-sev');
    idMap.registerEnumOption('Severity', 'High', 'nt-opt-high');
    const issue = buildYtIssue({
      customFields: [
        { name: 'Severity', value: { name: 'High' }, $type: 'SingleEnumIssueCustomField' },
      ],
    });

    const dto = transformer.transform(issue, idMap, statusMap);

    expect(dto.fieldValues).toEqual([{ fieldId: 'nt-field-sev', value: 'nt-opt-high' }]);
    expect(sink).not.toHaveBeenCalled();
  });

  it('drops an enum field whose option is unmapped and reports unresolved-value', () => {
    const sink = vi.fn();
    const transformer = new IssueTransformer(sink);
    const idMap = idMapWithReporter();
    idMap.registerCustomField('Severity', 'nt-field-sev');
    // option 'High' intentionally NOT registered
    const issue = buildYtIssue({
      customFields: [
        { name: 'Severity', value: { name: 'High' }, $type: 'SingleEnumIssueCustomField' },
      ],
    });

    const dto = transformer.transform(issue, idMap, statusMap);

    expect(dto.fieldValues).toEqual([]);
    expect(sink).toHaveBeenCalledWith({ name: 'Severity', reason: 'unresolved-value' });
  });

  it('reports each unmapped field only once across multiple issues', () => {
    const sink = vi.fn();
    const transformer = new IssueTransformer(sink);
    const idMap = idMapWithReporter();
    const cf = { name: 'Sprint Points', value: { text: '5' }, $type: 'TextIssueCustomField' };

    transformer.transform(buildYtIssue({ id: 'a', customFields: [cf] }), idMap, statusMap);
    transformer.transform(buildYtIssue({ id: 'b', customFields: [cf] }), idMap, statusMap);

    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('keeps a mapped field with an empty source value as an explicit null', () => {
    const sink = vi.fn();
    const transformer = new IssueTransformer(sink);
    const idMap = idMapWithReporter();
    idMap.registerCustomField('Notes', 'nt-field-notes');
    const issue = buildYtIssue({
      customFields: [{ name: 'Notes', value: null, $type: 'TextIssueCustomField' }],
    });

    const dto = transformer.transform(issue, idMap, statusMap);

    expect(dto.fieldValues).toEqual([{ fieldId: 'nt-field-notes', value: null }]);
    expect(sink).not.toHaveBeenCalled();
  });

  it('is usable without a sink', () => {
    const transformer = new IssueTransformer();
    const dto = transformer.transform(
      buildYtIssue({ customFields: [{ name: 'X', value: { text: 'y' } }] }),
      idMapWithReporter(),
      statusMap,
    );

    expect(dto.fieldValues).toEqual([]);
  });
});
