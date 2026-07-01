import { YtIssue, YtCustomField } from '../youtrack/types/yt-issue.type';
import { IdMapService } from '../id-map/id-map.service';

type IssueType = 'TASK' | 'BUG' | 'STORY' | 'EPIC' | 'FEATURE';
type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CreateIssueMigrationDto {
  title: string;
  description: any;
  type: IssueType;
  priority: Priority;
  statusId: string;
  assigneeId: string | null;
  reporterId: string;
  parentId: string | null;
  dueDate: string | null;
  estimate: number | null;
  fieldValues: { fieldId: string; value: any }[];
  originalCreatedAt: string;
  originalUpdatedAt: string;
  originalResolvedAt: string | null;
  ytId: string;
  ytNumber: number;
}

const TYPE_MAP: Record<string, IssueType> = {
  'Bug': 'BUG',
  'Task': 'TASK',
  'Feature': 'FEATURE',
  'User Story': 'STORY',
  'Epic': 'EPIC',
  'Cosmetics': 'BUG',
  'Exception': 'BUG',
  'Performance Problem': 'BUG',
  'Usability Problem': 'BUG',
};

const PRIORITY_MAP: Record<string, Priority> = {
  'Critical': 'CRITICAL',
  'Show-stopper': 'CRITICAL',
  'Major': 'HIGH',
  'Normal': 'MEDIUM',
  'Minor': 'LOW',
};

export type UnmappedFieldReason = 'no-field-mapping' | 'unresolved-value';

export interface UnmappedFieldReport {
  name: string;
  reason: UnmappedFieldReason;
}

export type UnmappedFieldSink = (report: UnmappedFieldReport) => void;

export class IssueTransformer {
  private readonly reportUnmapped: UnmappedFieldSink;
  private readonly reported = new Set<string>();

  constructor(onUnmappedField: UnmappedFieldSink = () => {}) {
    this.reportUnmapped = onUnmappedField;
  }

  transform(
    ytIssue: YtIssue,
    idMap: IdMapService,
    statusMap: Map<string, string>,
  ): CreateIssueMigrationDto {
    const statusId =
      (ytIssue.state?.name ? statusMap.get(ytIssue.state.name) : null) ??
      this.getInitialStatus(statusMap);

    return {
      title: ytIssue.summary,
      description: ytIssue.description
        ? this.convertMarkdownToTiptap(ytIssue.description)
        : null,
      type: TYPE_MAP[ytIssue.type?.name ?? ''] ?? 'TASK',
      priority: PRIORITY_MAP[ytIssue.priority?.name ?? ''] ?? 'MEDIUM',
      statusId,
      assigneeId: ytIssue.assignee
        ? idMap.getUserId(ytIssue.assignee.id)
        : null,
      reporterId: idMap.getUserId(ytIssue.reporter.id) ?? '',
      parentId: ytIssue.parent
        ? idMap.getIssueId(ytIssue.parent.id)
        : null,
      dueDate: ytIssue.dueDate
        ? new Date(ytIssue.dueDate).toISOString()
        : null,
      estimate: null,
      fieldValues: this.mapCustomFields(ytIssue.customFields ?? [], idMap),
      originalCreatedAt: new Date(ytIssue.created).toISOString(),
      originalUpdatedAt: new Date(ytIssue.updated).toISOString(),
      originalResolvedAt: ytIssue.resolved
        ? new Date(ytIssue.resolved).toISOString()
        : null,
      ytId: ytIssue.id,
      ytNumber: ytIssue.numberInProject,
    };
  }

  private getInitialStatus(statusMap: Map<string, string>): string {
    const first = statusMap.values().next();
    return first.value ?? '';
  }

  private convertMarkdownToTiptap(markdown: string): any {
    // Simple paragraph-based conversion
    // A full implementation would use markdown-it + tiptap serializer
    const paragraphs = markdown.split(/\n\n+/).filter(Boolean);

    return {
      type: 'doc',
      content: paragraphs.map((p) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: p.replace(/\n/g, ' ') }],
      })),
    };
  }

  private mapCustomFields(
    ytFields: YtCustomField[],
    idMap: IdMapService,
  ): { fieldId: string; value: any }[] {
    return ytFields.flatMap((ytField) => {
      const ourFieldId = idMap.getCustomFieldId(ytField.name);
      if (!ourFieldId) {
        this.noteUnmapped(ytField.name, 'no-field-mapping');
        return [];
      }

      const value = this.mapFieldValue(ytField, idMap);
      if (value === undefined) {
        this.noteUnmapped(ytField.name, 'unresolved-value');
        return [];
      }

      return [{ fieldId: ourFieldId, value }];
    });
  }

  // Report each (field, reason) at most once so a single unmapped field does not
  // emit one warning per migrated issue.
  private noteUnmapped(name: string, reason: UnmappedFieldReason): void {
    const key = `${name}:${reason}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.reportUnmapped({ name, reason });
  }

  // Returns `undefined` when a value cannot be resolved (unmapped enum option or
  // user) so the caller drops the field instead of writing a null that would
  // clobber the target. `null` means the source field was genuinely empty.
  private mapFieldValue(ytField: YtCustomField, idMap: IdMapService): unknown {
    if (!ytField.value) return null;

    const fieldType = ytField.$type ?? ytField.type ?? '';

    switch (fieldType) {
      case 'SingleEnumIssueCustomField':
      case 'EnumIssueCustomField':
        return idMap.getEnumOptionId(ytField.name, ytField.value.name) ?? undefined;
      case 'SingleUserIssueCustomField':
      case 'UserIssueCustomField':
        return idMap.getUserId(ytField.value.id) ?? undefined;
      case 'PeriodIssueCustomField':
        return ytField.value.minutes;
      case 'DateIssueCustomField':
        return new Date(ytField.value).toISOString().split('T')[0];
      default:
        return ytField.value.text ?? ytField.value;
    }
  }
}
