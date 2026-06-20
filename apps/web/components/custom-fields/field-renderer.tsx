'use client';

import { format } from 'date-fns';
import type { CustomField, CustomFieldType } from '@/lib/api/custom-fields.api';
import { TextFieldEditor } from './field-editors/text-field-editor';
import { NumberFieldEditor } from './field-editors/number-field-editor';
import { DateFieldEditor } from './field-editors/date-field-editor';
import { EnumFieldEditor } from './field-editors/enum-field-editor';
import { MultiEnumFieldEditor } from './field-editors/multi-enum-field-editor';
import { UserFieldEditor } from './field-editors/user-field-editor';
import { MultiUserFieldEditor } from './field-editors/multi-user-field-editor';
import { VersionFieldEditor } from './field-editors/version-field-editor';
import { MultiVersionFieldEditor } from './field-editors/multi-version-field-editor';
import { PeriodFieldEditor } from './field-editors/period-field-editor';
import { UrlFieldEditor } from './field-editors/url-field-editor';

interface FieldRendererProps {
  field: CustomField;
  value: unknown;
  onChange?: (value: unknown) => void;
  projectKey: string;
  inline?: boolean;
  readOnly?: boolean;
}

export function FieldRenderer({ field, value, onChange, projectKey, inline, readOnly }: FieldRendererProps) {
  if (readOnly) {
    return <ReadOnlyFieldValue field={field} value={value} />;
  }

  const handleChange = onChange ?? (() => {});
  const config = field.config as Record<string, unknown>;
  const rawOptions = (config?.options ?? []) as unknown[];
  const options = rawOptions.map((o) => o as { id: string; name: string; color?: string });

  switch (field.type as CustomFieldType) {
    case 'TEXT':
      return (
        <TextFieldEditor
          value={value as string | null}
          onChange={handleChange}
          placeholder={config?.placeholder as string | undefined}
          inline={inline}
        />
      );

    case 'NUMBER':
      return (
        <NumberFieldEditor
          value={value as number | null}
          onChange={handleChange}
          min={config?.min as number | undefined}
          max={config?.max as number | undefined}
          unit={config?.unit as string | undefined}
          inline={inline}
        />
      );

    case 'DATE':
      return (
        <DateFieldEditor
          value={value as string | null}
          onChange={handleChange}
          inline={inline}
        />
      );

    case 'DATETIME':
      return (
        <DateFieldEditor
          value={value as string | null}
          onChange={handleChange}
          includeTime
          inline={inline}
        />
      );

    case 'ENUM':
      return (
        <EnumFieldEditor
          value={value as string | null}
          onChange={handleChange}
          options={options}
          inline={inline}
        />
      );

    case 'MULTI_ENUM':
      return (
        <MultiEnumFieldEditor
          value={value as string[] | null}
          onChange={handleChange}
          options={options}
          inline={inline}
        />
      );

    case 'USER':
      return (
        <UserFieldEditor
          value={value as string | null}
          onChange={handleChange}
          projectKey={projectKey}
          inline={inline}
        />
      );

    case 'MULTI_USER':
      return (
        <MultiUserFieldEditor
          value={value as string[] | null}
          onChange={handleChange}
          projectKey={projectKey}
          inline={inline}
        />
      );

    case 'VERSION':
      return (
        <VersionFieldEditor
          value={value as string | null}
          onChange={handleChange}
          projectKey={projectKey}
          inline={inline}
        />
      );

    case 'MULTI_VERSION':
      return (
        <MultiVersionFieldEditor
          value={value as string[] | null}
          onChange={handleChange}
          projectKey={projectKey}
          inline={inline}
        />
      );

    case 'PERIOD':
      return (
        <PeriodFieldEditor
          value={value as string | null}
          onChange={handleChange}
          inline={inline}
        />
      );

    case 'URL':
      return (
        <UrlFieldEditor
          value={value as string | null}
          onChange={handleChange}
          placeholder={config?.placeholder as string | undefined}
          inline={inline}
        />
      );

    default:
      return <span className="text-sm text-muted-foreground">Unsupported field type</span>;
  }
}

function ReadOnlyFieldValue({ field, value }: { field: CustomField; value: unknown }) {
  const empty = <span className="text-xs text-muted-foreground">—</span>;

  if (value == null || value === '') return empty;

  const type = field.type as CustomFieldType;

  if (type === 'DATE' || type === 'DATETIME') {
    try {
      const formatted = format(new Date(value as string), type === 'DATETIME' ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy');
      return <span className="text-xs">{formatted}</span>;
    } catch {
      return <span className="text-xs">{String(value)}</span>;
    }
  }

  if (type === 'ENUM') {
    const options = ((field.config as Record<string, unknown>)?.options ?? []) as { id: string; name: string }[];
    const opt = options.find((o) => o.id === value);
    return <span className="text-xs">{opt?.name ?? String(value)}</span>;
  }

  if (type === 'MULTI_ENUM') {
    const options = ((field.config as Record<string, unknown>)?.options ?? []) as { id: string; name: string }[];
    const arr = Array.isArray(value) ? value : [];
    if (arr.length === 0) return empty;
    const names = arr.map((id) => options.find((o) => o.id === id)?.name ?? id);
    return <span className="text-xs">{names.join(', ')}</span>;
  }

  if (type === 'MULTI_USER' || type === 'MULTI_VERSION') {
    const arr = Array.isArray(value) ? value : [];
    if (arr.length === 0) return empty;
    return <span className="text-xs">{arr.join(', ')}</span>;
  }

  if (type === 'URL') {
    return (
      <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
        {String(value)}
      </a>
    );
  }

  return <span className="text-xs">{String(value)}</span>;
}
