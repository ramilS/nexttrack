import { YtIssue, YtCustomField } from '../youtrack/types/yt-issue.type';
import { IdMapService } from '../id-map/id-map.service';
import { richTextToTiptap } from './rich-text';
import {
  isFirstClassField,
  ytFieldType,
  FIRST_CLASS_FIELD_TYPES,
} from './field-classification';

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
  'Story': 'STORY',
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

export type UnmappedFieldReason =
  | 'no-field-mapping'
  | 'unresolved-value'
  | 'unresolved-user'
  | 'estimate-unit-mismatch';

export interface TransformOptions {
  // Name of the YouTrack custom field whose value becomes Issue.estimate.
  estimateFieldName?: string;
}

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
    opts?: TransformOptions,
  ): CreateIssueMigrationDto {
    // YouTrack keeps Type/State/Assignee/Priority in customFields, NOT as
    // top-level Issue attributes (top-level comes back empty). Read them from
    // customFields, falling back to any top-level value for configs that do
    // expose it.
    const stateName =
      this.fieldByType(ytIssue, FIRST_CLASS_FIELD_TYPES)?.value?.name ??
      ytIssue.state?.name ??
      null;
    const statusId =
      (stateName ? statusMap.get(stateName) : null) ??
      this.getInitialStatus(statusMap);

    const typeName = this.fieldByName(ytIssue, 'Type')?.value?.name ?? ytIssue.type?.name ?? '';
    const priorityName =
      this.fieldByName(ytIssue, 'Priority')?.value?.name ?? ytIssue.priority?.name ?? '';
    const assigneeRef = this.fieldByName(ytIssue, 'Assignee')?.value ?? ytIssue.assignee;

    return {
      title: ytIssue.summary,
      description: ytIssue.description
        ? richTextToTiptap(ytIssue.description)
        : null,
      type: TYPE_MAP[typeName] ?? 'TASK',
      priority: PRIORITY_MAP[priorityName] ?? 'MEDIUM',
      statusId,
      assigneeId: assigneeRef ? idMap.getUserId(assigneeRef.id) : null,
      reporterId: this.resolveReporter(ytIssue, idMap),
      parentId: ytIssue.parent
        ? idMap.getIssueId(ytIssue.parent.id)
        : null,
      dueDate: ytIssue.dueDate
        ? new Date(ytIssue.dueDate).toISOString()
        : null,
      estimate: this.resolveEstimate(ytIssue, opts?.estimateFieldName),
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

  private fieldByName(ytIssue: YtIssue, name: string): YtCustomField | undefined {
    return ytIssue.customFields?.find((f) => f.name === name);
  }

  private fieldByType(ytIssue: YtIssue, types: Set<string>): YtCustomField | undefined {
    return ytIssue.customFields?.find((f) => types.has(ytFieldType(f)));
  }

  private mapCustomFields(
    ytFields: YtCustomField[],
    idMap: IdMapService,
  ): { fieldId: string; value: any }[] {
    return ytFields.flatMap((ytField) => {
      // Type/State/Assignee/Priority are migrated as native Issue attributes,
      // not custom-field values — skip them here (also silences their bogus
      // "no mapping" warnings).
      if (isFirstClassField(ytField)) return [];

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

  // NextTrack estimate is story points (Int 1..9999). When the configured field
  // is a YouTrack period (time in minutes), the raw minutes are carried over
  // with a one-time unit-mismatch warning — the operator opted in via
  // --estimate-field. Out-of-range values are dropped (issue must survive).
  private resolveEstimate(
    ytIssue: YtIssue,
    fieldName?: string,
  ): number | null {
    if (!fieldName) return null;
    const field = ytIssue.customFields?.find((f) => f.name === fieldName);
    if (!field || field.value == null) return null;

    const type = field.$type ?? field.type ?? '';
    let raw: unknown;
    if (type === 'PeriodIssueCustomField') {
      this.noteUnmapped(fieldName, 'estimate-unit-mismatch');
      raw = field.value.minutes;
    } else {
      raw = typeof field.value === 'number' ? field.value : field.value?.name ?? field.value;
    }

    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n >= 1 && n <= 9999 ? n : null;
  }

  // Reporter is a required guid on the target, so an unresolved author (account
  // deleted in YouTrack → absent from /admin/users) falls back to the migration
  // ghost user instead of '' (which would 400 and lose the whole issue).
  private resolveReporter(ytIssue: YtIssue, idMap: IdMapService): string {
    const mapped = idMap.getUserId(ytIssue.reporter.id);
    if (mapped) return mapped;

    this.noteUnmapped(`reporter ${ytIssue.reporter.login ?? ytIssue.reporter.id}`, 'unresolved-user');
    return idMap.getFallbackUserId() ?? '';
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
  // Multi-value fields (arrays) map each element and drop unresolved ones.
  private mapFieldValue(ytField: YtCustomField, idMap: IdMapService): unknown {
    if (ytField.value == null) return null;

    const fieldType = ytField.$type ?? ytField.type ?? '';

    if (Array.isArray(ytField.value)) {
      const mapped = ytField.value
        .map((el) => this.mapScalarValue(fieldType, el, ytField.name, idMap))
        .filter((v) => v !== undefined);
      if (mapped.length < ytField.value.length) {
        this.noteUnmapped(ytField.name, 'unresolved-value');
      }
      return mapped.length > 0 ? mapped : undefined;
    }

    return this.mapScalarValue(fieldType, ytField.value, ytField.name, idMap);
  }

  private mapScalarValue(
    fieldType: string,
    value: any,
    fieldName: string,
    idMap: IdMapService,
  ): unknown {
    switch (fieldType) {
      // Bundle-backed fields (enum/state/owned/build/version) — YouTrack uses
      // the Single*/Multi* prefixes (e.g. SingleOwnedIssueCustomField); each
      // element carries the option in `value.name`.
      case 'SingleEnumIssueCustomField':
      case 'EnumIssueCustomField':
      case 'MultiEnumIssueCustomField':
      case 'StateIssueCustomField':
      case 'StateMachineIssueCustomField':
      case 'SingleVersionIssueCustomField':
      case 'VersionIssueCustomField':
      case 'MultiVersionIssueCustomField':
      case 'SingleOwnedIssueCustomField':
      case 'OwnedIssueCustomField':
      case 'MultiOwnedIssueCustomField':
      case 'SingleBuildIssueCustomField':
      case 'BuildIssueCustomField':
      case 'MultiBuildIssueCustomField':
        return idMap.getEnumOptionId(fieldName, value.name) ?? undefined;
      case 'SingleUserIssueCustomField':
      case 'UserIssueCustomField':
      case 'MultiUserIssueCustomField':
        return idMap.getUserId(value.id) ?? undefined;
      case 'PeriodIssueCustomField':
        return value.minutes;
      case 'DateIssueCustomField':
        return new Date(value).toISOString().split('T')[0];
      default:
        return value.text ?? value;
    }
  }
}
