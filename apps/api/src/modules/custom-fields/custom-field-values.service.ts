import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { CustomFieldType, ActivityType } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  CustomField,
  CustomFieldValue,
  DisplayValue,
  FieldOption,
} from '@repo/shared/schemas';
import type { Tx } from '@/common/repository/tx.types';
import { CustomFieldValidatorService } from './custom-field-validator.service';
import {
  CustomFieldsRepository,
  getFieldConfig,
} from './custom-fields.repository';
import { CustomFieldValuesRepository } from './custom-field-values.repository';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { VersionsRepository } from '@/modules/versions/versions.repository';
import { normalizeEnumConfig } from './normalize-enum-config';
import { formatPeriod } from './period-parser';

interface FieldValueInput {
  fieldId: string;
  value: unknown;
}

@Injectable()
export class CustomFieldValuesService {
  constructor(
    private fieldsRepo: CustomFieldsRepository,
    private valuesRepo: CustomFieldValuesRepository,
    private issuesRepo: IssuesRepository,
    private usersRepo: UsersReader,
    private versionsRepo: VersionsRepository,
    private validator: CustomFieldValidatorService,
    private activitiesService: ActivitiesService,
  ) {}

  async getFieldsForIssue(
    issueId: string,
    projectId: string,
  ): Promise<CustomFieldValue[]> {
    const fields = await this.fieldsRepo.findManyByProject(projectId);
    const normalized = await Promise.all(fields.map((f) => this.normalizedField(f)));

    const values = await this.valuesRepo.findByIssueAndFields(
      issueId,
      normalized.map((f) => f.id),
    );
    const valueMap = new Map(values.map((v) => [v.customFieldId, v.value]));

    const result: CustomFieldValue[] = [];
    for (const field of normalized) {
      const rawValue = valueMap.has(field.id) ? valueMap.get(field.id) ?? null : null;
      result.push(await this.buildFieldValueDto(field, rawValue));
    }
    return result;
  }

  async setFieldValue(
    issueId: string,
    fieldId: string,
    rawValue: unknown,
    userId: string,
    projectId: string,
  ): Promise<CustomFieldValue> {
    const field = await this.requireField(fieldId, projectId);
    const normalized = await this.normalizedField(field);

    const existing = await this.valuesRepo.findByIssueAndField(issueId, fieldId);
    const oldValue = existing ? existing.value : null;

    if (rawValue === null || rawValue === undefined) {
      if (normalized.isRequired) {
        throw new ValidationError(
          ErrorCode.FIELD_REQUIRED,
          `Field "${normalized.name}" is required`,
        );
      }

      if (existing) {
        await this.valuesRepo.deleteById(existing.id);
      }

      await this.recordFieldActivity(issueId, userId, normalized, oldValue, null);
      await this.issuesRepo.touchUpdatedAt(issueId);

      return this.buildFieldValueDto(normalized, null);
    }

    const validatedValue = await this.validator.validate(normalized, rawValue, projectId);
    await this.valuesRepo.upsert(issueId, fieldId, validatedValue);

    await this.recordFieldActivity(issueId, userId, normalized, oldValue, validatedValue);
    await this.issuesRepo.touchUpdatedAt(issueId);

    return this.buildFieldValueDto(normalized, validatedValue);
  }

  async clearFieldValue(
    issueId: string,
    fieldId: string,
    userId: string,
    projectId: string,
  ): Promise<void> {
    const field = await this.requireField(fieldId, projectId);

    if (field.isRequired) {
      throw new ValidationError(
        ErrorCode.FIELD_REQUIRED,
        `Field "${field.name}" is required and cannot be cleared`,
      );
    }

    const existing = await this.valuesRepo.findByIssueAndField(issueId, fieldId);
    if (!existing) return;

    await this.valuesRepo.deleteById(existing.id);
    await this.recordFieldActivity(issueId, userId, field, existing.value, null);
    await this.issuesRepo.touchUpdatedAt(issueId);
  }

  async validateRequiredFields(
    projectId: string,
    fieldValues?: FieldValueInput[],
  ): Promise<void> {
    const required = await this.fieldsRepo.findRequiredInProject(projectId);
    if (required.length === 0) return;

    const provided = new Set((fieldValues ?? []).map((f) => f.fieldId));
    const missing = required.filter((f) => !provided.has(f.id));

    if (missing.length > 0) {
      throw new ValidationError(
        ErrorCode.FIELD_REQUIRED,
        'Required custom fields are missing',
        { missingFields: missing },
      );
    }
  }

  /**
   * Writes the initial custom-field values during issue creation, inside the
   * caller's transaction — so an invalid value rolls back the issue instead
   * of leaving an orphan, and a crash can't persist the issue without its
   * fields. Unlike {@link setFieldValue} there is no previous value to diff
   * against and no separate updatedAt bump to make.
   */
  async setInitialFieldValues(
    issueId: string,
    projectId: string,
    userId: string,
    fieldValues: FieldValueInput[],
    tx: Tx,
  ): Promise<void> {
    for (const { fieldId, value } of fieldValues) {
      const field = await this.requireField(fieldId, projectId);
      const normalized = await this.normalizedField(field);

      if (value === null || value === undefined) {
        if (normalized.isRequired) {
          throw new ValidationError(
            ErrorCode.FIELD_REQUIRED,
            `Field "${normalized.name}" is required`,
          );
        }
        continue;
      }

      const validatedValue = await this.validator.validate(normalized, value, projectId);
      await this.valuesRepo.upsert(issueId, fieldId, validatedValue, tx);
      await this.recordFieldActivity(issueId, userId, normalized, null, validatedValue, tx);
    }
  }

  async resolveIssueProject(issueId: string): Promise<string> {
    const projectId = await this.issuesRepo.findProjectIdById(issueId);
    if (!projectId) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }
    return projectId;
  }

  // ─── Private ───────────────────────────────────────────────

  private async requireField(
    fieldId: string,
    projectId: string,
  ): Promise<CustomField> {
    const field = await this.fieldsRepo.findOneInProject(fieldId, projectId);
    if (!field) {
      throw new NotFoundError(ErrorCode.FIELD_NOT_FOUND);
    }
    return field;
  }

  private async normalizedField(field: CustomField): Promise<CustomField> {
    if (
      field.type !== CustomFieldType.ENUM &&
      field.type !== CustomFieldType.MULTI_ENUM
    ) {
      return field;
    }
    const { config, changed } = normalizeEnumConfig(field.config);
    if (!changed) return field;

    await this.fieldsRepo.updateConfig(field.id, config);
    return { ...field, config };
  }

  private async recordFieldActivity(
    issueId: string,
    userId: string,
    field: CustomField,
    oldValue: unknown,
    newValue: unknown,
    tx?: Tx,
  ): Promise<void> {
    const fromDisplay = await this.formatForActivity(field, oldValue);
    const toDisplay = await this.formatForActivity(field, newValue);

    await this.activitiesService.recordOne(
      issueId,
      userId,
      ActivityType.FIELD_VALUE_CHANGE,
      {
        fieldId: field.id,
        fieldName: field.name,
        from: fromDisplay,
        to: toDisplay,
      },
      tx,
    );
  }

  private async formatForActivity(
    field: CustomField,
    value: unknown,
  ): Promise<string | null> {
    if (value === null || value === undefined) return null;

    switch (field.type) {
      case CustomFieldType.TEXT:
        return String(value);
      case CustomFieldType.NUMBER: {
        const cfg = getFieldConfig(field);
        return cfg.unit ? `${String(value)} ${cfg.unit}` : String(value);
      }
      case CustomFieldType.DATE:
      case CustomFieldType.DATETIME:
        return String(value);
      case CustomFieldType.ENUM: {
        const cfg = getFieldConfig(field);
        const opt = (cfg.options ?? []).find((o) => o.id === value);
        return opt?.name ?? String(value);
      }
      case CustomFieldType.MULTI_ENUM: {
        const cfg = getFieldConfig(field);
        const opts = cfg.options ?? [];
        const ids = value as string[];
        return ids.map((id) => opts.find((o) => o.id === id)?.name ?? id).join(', ');
      }
      case CustomFieldType.USER: {
        const [user] = await this.usersRepo.findNameRefsByIds([value as string]);
        return user?.name ?? String(value);
      }
      case CustomFieldType.MULTI_USER: {
        const users = await this.usersRepo.findNameRefsByIds(value as string[]);
        return users.map((u) => u.name).join(', ');
      }
      case CustomFieldType.VERSION: {
        const [ver] = await this.versionsRepo.findManyByIds([value as string]);
        return ver?.name ?? String(value);
      }
      case CustomFieldType.MULTI_VERSION: {
        const vers = await this.versionsRepo.findManyByIds(value as string[]);
        return vers.map((v) => v.name).join(', ');
      }
      case CustomFieldType.PERIOD:
        return formatPeriod(value as number);
      case CustomFieldType.URL:
        return String(value);
      default:
        return String(value);
    }
  }

  private async buildDisplayValue(
    field: CustomField,
    value: unknown,
  ): Promise<DisplayValue | null> {
    if (value === null || value === undefined) return null;

    switch (field.type) {
      case CustomFieldType.TEXT:
        return { type: 'text', text: String(value) };
      case CustomFieldType.NUMBER: {
        const cfg = getFieldConfig(field);
        const num = value as number;
        return {
          type: 'number',
          number: num,
          formatted: cfg.unit ? `${num} ${cfg.unit}` : String(num),
        };
      }
      case CustomFieldType.DATE:
      case CustomFieldType.DATETIME: {
        const str = String(value);
        return { type: 'date', date: str, formatted: str };
      }
      case CustomFieldType.ENUM: {
        const cfg = getFieldConfig(field);
        const opt = (cfg.options ?? []).find((o) => o.id === value);
        return opt ? { type: 'enum', option: opt as FieldOption } : null;
      }
      case CustomFieldType.MULTI_ENUM: {
        const cfg = getFieldConfig(field);
        const opts = cfg.options ?? [];
        const ids = value as string[];
        const matched = ids
          .map((id) => opts.find((o) => o.id === id))
          .filter((o): o is FieldOption => o != null);
        return { type: 'multi_enum', options: matched };
      }
      case CustomFieldType.USER: {
        const [user] = await this.usersRepo.findPublicRefsByIds([value as string]);
        return user ? { type: 'user', user } : null;
      }
      case CustomFieldType.MULTI_USER: {
        const users = await this.usersRepo.findPublicRefsByIds(value as string[]);
        return { type: 'multi_user', users };
      }
      case CustomFieldType.VERSION: {
        const [ver] = await this.versionsRepo.findManyByIds([value as string]);
        return ver ? { type: 'version', version: ver } : null;
      }
      case CustomFieldType.MULTI_VERSION: {
        const vers = await this.versionsRepo.findManyByIds(value as string[]);
        return { type: 'multi_version', versions: vers };
      }
      case CustomFieldType.PERIOD: {
        const minutes = value as number;
        return { type: 'period', minutes, formatted: formatPeriod(minutes) };
      }
      case CustomFieldType.URL:
        return { type: 'url', url: String(value) };
      default:
        return null;
    }
  }

  private async buildFieldValueDto(
    field: CustomField,
    value: unknown,
  ): Promise<CustomFieldValue> {
    const displayValue = await this.buildDisplayValue(field, value);
    return {
      fieldId: field.id,
      fieldName: field.name,
      fieldType: field.type,
      fieldConfig: getFieldConfig(field),
      value,
      displayValue,
      isRequired: field.isRequired,
      ordinal: field.ordinal,
    };
  }
}
