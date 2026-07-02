import { describe, it, expect } from 'vitest';
import { CustomFieldDefsExtractor } from './custom-field-defs.extractor';
import { YouTrackClient } from '../youtrack/youtrack-client';

function clientYielding(pages: unknown[][]): YouTrackClient {
  return {
    async *paginate() {
      for (const page of pages) yield page;
    },
  } as unknown as YouTrackClient;
}

describe('CustomFieldDefsExtractor.collect', () => {
  it('accumulates field types and dedups bundle option names across issues', async () => {
    const extractor = new CustomFieldDefsExtractor(
      clientYielding([
        [
          {
            customFields: [
              { name: 'Subsystem', $type: 'SingleOwnedIssueCustomField', value: { name: 'Backend' } },
              { name: 'QA Assignee', $type: 'SingleUserIssueCustomField', value: null },
            ],
          },
          {
            customFields: [
              { name: 'Subsystem', $type: 'SingleOwnedIssueCustomField', value: { name: 'Frontend' } },
              { name: 'Subsystem', $type: 'SingleOwnedIssueCustomField', value: { name: 'Backend' } },
            ],
          },
        ],
      ]),
    );

    const defs = await extractor.collect('SPL');
    const subsystem = defs.find((d) => d.name === 'Subsystem');
    const qa = defs.find((d) => d.name === 'QA Assignee');

    expect(subsystem).toEqual({
      name: 'Subsystem',
      ytType: 'SingleOwnedIssueCustomField',
      optionNames: ['Backend', 'Frontend'],
    });
    // A field seen only with null values is still discovered, with no options.
    expect(qa).toEqual({
      name: 'QA Assignee',
      ytType: 'SingleUserIssueCustomField',
      optionNames: [],
    });
  });

  it('collects option names from a multi-value (array) field', async () => {
    const extractor = new CustomFieldDefsExtractor(
      clientYielding([
        [
          {
            customFields: [
              {
                name: 'Platforms',
                $type: 'MultiEnumIssueCustomField',
                value: [{ name: 'iOS' }, { name: 'Web' }],
              },
            ],
          },
        ],
      ]),
    );

    const defs = await extractor.collect('SPL');

    expect(defs).toEqual([
      { name: 'Platforms', ytType: 'MultiEnumIssueCustomField', optionNames: ['iOS', 'Web'] },
    ]);
  });
});
