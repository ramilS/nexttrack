import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtCustomField } from '../youtrack/types/yt-issue.type';
import { YtFieldDef } from '../transformers/custom-field-def.transformer';
import { ytFieldType } from '../transformers/field-classification';

// Minimal projection: we only need each field's name, $type, and bundle option
// names — not the full issue. YouTrack has no reliable public per-project
// custom-field-definition endpoint across versions, so definitions are derived
// from the issues themselves (a field appears in every issue's customFields,
// even when its value is null, so all fields are discovered; option names come
// from the non-null values seen).
const DEF_FIELDS = 'customFields(name,$type,value(name))';

interface IssueCustomFields {
  customFields?: YtCustomField[];
}

export class CustomFieldDefsExtractor {
  constructor(private yt: YouTrackClient) {}

  async collect(projectKey: string): Promise<YtFieldDef[]> {
    const byName = new Map<string, { ytType: string; options: Set<string> }>();

    const query = `project: ${projectKey}`;
    for await (const batch of this.yt.paginate<IssueCustomFields>('/issues', {
      query,
      fields: DEF_FIELDS,
    })) {
      for (const issue of batch) {
        for (const field of issue.customFields ?? []) {
          const entry =
            byName.get(field.name) ??
            { ytType: ytFieldType(field), options: new Set<string>() };
          for (const name of optionNames(field.value)) entry.options.add(name);
          byName.set(field.name, entry);
        }
      }
    }

    return [...byName].map(([name, { ytType, options }]) => ({
      name,
      ytType,
      optionNames: [...options],
    }));
  }
}

// Bundle option names from a custom-field value: a single bundle element
// ({ name }), an array of them (multi), or nothing (null / scalar values).
function optionNames(value: unknown): string[] {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((el) => (el && typeof el === 'object' ? (el as { name?: string }).name : undefined))
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
}
