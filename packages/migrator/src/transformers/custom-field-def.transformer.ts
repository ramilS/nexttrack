import { isFirstClassField } from './field-classification';

// NextTrack custom-field types (mirror of the API's CustomFieldType enum). The
// migrator is standalone and does not depend on @repo/shared, so the shape of
// the create-field DTO is declared locally.
export type NextTrackFieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'DATETIME'
  | 'ENUM'
  | 'MULTI_ENUM'
  | 'USER'
  | 'MULTI_USER'
  | 'VERSION'
  | 'MULTI_VERSION'
  | 'PERIOD'
  | 'URL';

export interface CreateCustomFieldDto {
  name: string;
  type: NextTrackFieldType;
  config: Record<string, unknown>;
}

// A YouTrack custom-field definition as observed across a project's issues:
// its name, YouTrack $type, and the set of bundle option names actually seen
// (empty for non-bundle fields).
export interface YtFieldDef {
  name: string;
  ytType: string;
  optionNames: string[];
}

export type FieldDefResult =
  | { kind: 'create'; dto: CreateCustomFieldDto }
  | { kind: 'skip'; reason: 'first-class' | 'unsupported' | 'empty-enum' };

// Bundle-backed single/multi fields → ENUM/MULTI_ENUM (options carried over).
const ENUM_SINGLE = new Set([
  'SingleEnumIssueCustomField',
  'EnumIssueCustomField',
  'SingleOwnedIssueCustomField',
  'OwnedIssueCustomField',
  'SingleBuildIssueCustomField',
  'BuildIssueCustomField',
  'SingleVersionIssueCustomField',
  'VersionIssueCustomField',
]);
const ENUM_MULTI = new Set([
  'MultiEnumIssueCustomField',
  'MultiOwnedIssueCustomField',
  'MultiBuildIssueCustomField',
  'MultiVersionIssueCustomField',
]);

const SCALAR_TYPE: Record<string, NextTrackFieldType> = {
  SingleUserIssueCustomField: 'USER',
  UserIssueCustomField: 'USER',
  MultiUserIssueCustomField: 'MULTI_USER',
  PeriodIssueCustomField: 'PERIOD',
  DateIssueCustomField: 'DATE',
  TextIssueCustomField: 'TEXT',
  SimpleIssueCustomField: 'TEXT',
};

// Map a discovered YouTrack field to a NextTrack create-field DTO, or explain
// why it is skipped. First-class fields (Type/State/Assignee/Priority) are
// migrated as native Issue attributes elsewhere, never as custom fields.
export function buildCustomFieldDto(def: YtFieldDef): FieldDefResult {
  if (isFirstClassField({ name: def.name, $type: def.ytType })) {
    return { kind: 'skip', reason: 'first-class' };
  }

  const isSingleEnum = ENUM_SINGLE.has(def.ytType);
  const isMultiEnum = ENUM_MULTI.has(def.ytType);
  if (isSingleEnum || isMultiEnum) {
    if (def.optionNames.length === 0) {
      // Bundle field with no observed values — nothing to migrate, and the
      // ENUM config requires at least one option.
      return { kind: 'skip', reason: 'empty-enum' };
    }
    return {
      kind: 'create',
      dto: {
        name: def.name,
        type: isMultiEnum ? 'MULTI_ENUM' : 'ENUM',
        config: {
          type: isMultiEnum ? 'MULTI_ENUM' : 'ENUM',
          options: def.optionNames.map((name) => ({ name })),
        },
      },
    };
  }

  const scalar = SCALAR_TYPE[def.ytType];
  if (!scalar) {
    return { kind: 'skip', reason: 'unsupported' };
  }
  return {
    kind: 'create',
    dto: { name: def.name, type: scalar, config: { type: scalar } },
  };
}
