import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
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
import { TransactionService } from '@/common/repository/transaction.service';
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
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { normalizeEnumConfig } from './normalize-enum-config';
import { formatPeriod } from './period-parser';

interface FieldValueInput {
  fieldId: string;
  value: unknown;
}

type UserDisplayReference = Awaited<
  ReturnType<UsersReader['findPublicRefsByIds']>
>[number];
type VersionDisplayReference = Awaited<
  ReturnType<VersionsRepository['findManyByIds']>
>[number];

interface DisplayReferences {
  usersById: ReadonlyMap<string, UserDisplayReference>;
  versionsById: ReadonlyMap<string, VersionDisplayReference>;
}

@Injectable()
export class CustomFieldValuesService {
  private readonly logger = new AppLogger(CustomFieldValuesService.name);

  constructor(
    private fieldsRepo: CustomFieldsRepository,
    private valuesRepo: CustomFieldValuesRepository,
    private issuesRepo: IssuesRepository,
    private usersRepo: UsersReader,
    private versionsRepo: VersionsRepository,
    private validator: CustomFieldValidatorService,
    private activitiesService: ActivitiesService,
    private txService: TransactionService,
    private indexerHooks: IndexerHooksService,
    private background: BackgroundTasks,
  ) {}

  /**
   * Custom field values are part of the ES issue document, so a value change
   * must re-index — otherwise filtering/sorting by the field returns stale
   * results. Fire-and-forget after commit (the indexer reads committed data at
   * job time); the FIELD_VALUE_CHANGE activity is recorded synchronously in the
   * mutation tx above. No issue.updated event: a field change has no status/
   * assignee/notification semantics, only re-index — same profile as time logs.
   */
  private scheduleReindex(issueId: string): void {
    this.background.run(
      () => this.indexerHooks.onIssueChanged(issueId, 'field_value'),
      (err) =>
        this.logger.error('Reindex after custom-field change failed', err, {
          issueId,
        }),
    );
  }

  async getFieldsForIssue(
    issueId: string,
    projectId: string,
  ): Promise<CustomFieldValue[]> {
    const fields = await this.fieldsRepo.findManyByProject(projectId);
    const normalized = fields.map((field) => this.normalizedField(field));

    const values = await this.valuesRepo.findByIssueAndFields(
      issueId,
      normalized.map((f) => f.id),
    );
    const valueMap = new Map(values.map((v) => [v.customFieldId, v.value]));
    const displayReferences = await this.loadDisplayReferences(
      normalized.map((field) => ({
        field,
        value: valueMap.has(field.id) ? valueMap.get(field.id) ?? null : null,
      })),
    );

    const result: CustomFieldValue[] = [];
    for (const field of normalized) {
      const rawValue = valueMap.has(field.id) ? valueMap.get(field.id) ?? null : null;
      result.push(await this.buildFieldValueDto(field, rawValue, displayReferences));
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
    const normalized = this.normalizedField(field);

    const existing = await this.valuesRepo.findByIssueAndField(issueId, fieldId);
    const oldValue = existing ? existing.value : null;

    if (rawValue === null || rawValue === undefined) {
      if (normalized.isRequired) {
        throw new ValidationError(
          ErrorCode.FIELD_REQUIRED,
          `Field "${normalized.name}" is required`,
        );
      }

      const references = await this.loadDisplayReferences([
        { field: normalized, value: oldValue },
      ]);
      await this.txService.run(async (tx) => {
        if (existing) {
          await this.valuesRepo.deleteById(existing.id, tx);
        }
        await this.recordFieldActivity(
          issueId,
          userId,
          normalized,
          oldValue,
          null,
          tx,
          references,
        );
        await this.issuesRepo.touchUpdatedAt(issueId, tx);
      });
      this.scheduleReindex(issueId);

      this.logger.log('Custom field value cleared', {
        issueId,
        fieldId,
        fieldType: normalized.type,
      });

      return this.buildFieldValueDto(normalized, null, references);
    }

    const validatedValue = await this.validator.validate(normalized, rawValue, projectId);
    const references = await this.loadDisplayReferences([
      { field: normalized, value: oldValue },
      { field: normalized, value: validatedValue },
    ]);
    await this.txService.run(async (tx) => {
      await this.valuesRepo.upsert(issueId, fieldId, validatedValue, tx);
      await this.recordFieldActivity(
        issueId,
        userId,
        normalized,
        oldValue,
        validatedValue,
        tx,
        references,
      );
      await this.issuesRepo.touchUpdatedAt(issueId, tx);
    });
    this.scheduleReindex(issueId);

    this.logger.log('Custom field value set', {
      issueId,
      fieldId,
      fieldType: normalized.type,
      hadPreviousValue: oldValue !== null,
    });

    return this.buildFieldValueDto(normalized, validatedValue, references);
  }

  async clearFieldValue(
    issueId: string,
    fieldId: string,
    userId: string,
    projectId: string,
  ): Promise<void> {
    const field = this.normalizedField(await this.requireField(fieldId, projectId));

    if (field.isRequired) {
      throw new ValidationError(
        ErrorCode.FIELD_REQUIRED,
        `Field "${field.name}" is required and cannot be cleared`,
      );
    }

    const existing = await this.valuesRepo.findByIssueAndField(issueId, fieldId);
    if (!existing) return;

    const references = await this.loadDisplayReferences([{ field, value: existing.value }]);
    await this.txService.run(async (tx) => {
      await this.valuesRepo.deleteById(existing.id, tx);
      await this.recordFieldActivity(
        issueId,
        userId,
        field,
        existing.value,
        null,
        tx,
        references,
      );
      await this.issuesRepo.touchUpdatedAt(issueId, tx);
    });
    this.scheduleReindex(issueId);

    this.logger.log('Custom field value cleared', {
      issueId,
      fieldId,
      fieldType: field.type,
    });
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
    if (fieldValues.length === 0) return;

    // Fetch the project's fields once into a map instead of a per-field
    // lookup — the issue-creation tx stays open for every round-trip otherwise.
    const projectFields = await this.fieldsRepo.findManyByProject(projectId);
    const fieldById = new Map(projectFields.map((f) => [f.id, f]));

    const pairs = fieldValues.map(({ fieldId, value }) => {
      const field = fieldById.get(fieldId);
      if (!field) {
        throw new NotFoundError(ErrorCode.FIELD_NOT_FOUND);
      }
      return { field: this.normalizedField(field), value };
    });

    // Validate the whole batch with one membership + one version lookup
    // (instead of per-field), then persist values and activities in one write
    // each rather than a query per field inside the open transaction.
    const validated = await this.validator.validateMany(pairs, projectId);
    const present = validated.filter((v) => v.validatedValue != null);
    if (present.length === 0) return;
    const references = await this.loadDisplayReferences(
      present.map(({ field, validatedValue }) => ({ field, value: validatedValue })),
    );

    await this.valuesRepo.createMany(
      issueId,
      present.map((v) => ({ fieldId: v.field.id, value: v.validatedValue })),
      tx,
    );

    const entries = await Promise.all(
      present.map(async ({ field, validatedValue }) => ({
        type: ActivityType.FIELD_VALUE_CHANGE,
        payload: {
          fieldId: field.id,
          fieldName: field.name,
          from: null,
          to: await this.formatForActivity(field, validatedValue, references),
        },
      })),
    );
    await this.activitiesService.record(issueId, userId, entries, tx);
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

  private normalizedField(field: CustomField): CustomField {
    if (
      field.type !== CustomFieldType.ENUM &&
      field.type !== CustomFieldType.MULTI_ENUM
    ) {
      return field;
    }
    const { config, changed } = normalizeEnumConfig(field.id, field.config);
    if (!changed) return field;

    return { ...field, config };
  }

  private async loadDisplayReferences(
    items: ReadonlyArray<{ field: CustomField; value: unknown }>,
  ): Promise<DisplayReferences> {
    const userIds = new Set<string>();
    const versionIds = new Set<string>();

    for (const { field, value } of items) {
      switch (field.type) {
        case CustomFieldType.USER:
        case CustomFieldType.MULTI_USER:
          this.collectReferenceIds(value, userIds);
          break;
        case CustomFieldType.VERSION:
        case CustomFieldType.MULTI_VERSION:
          this.collectReferenceIds(value, versionIds);
          break;
      }
    }

    const [users, versions] = await Promise.all([
      userIds.size > 0
        ? this.usersRepo.findPublicRefsByIds([...userIds])
        : Promise.resolve([] as UserDisplayReference[]),
      versionIds.size > 0
        ? this.versionsRepo.findManyByIds([...versionIds])
        : Promise.resolve([] as VersionDisplayReference[]),
    ]);

    return {
      usersById: new Map(users.map((user) => [user.id, user])),
      versionsById: new Map(versions.map((version) => [version.id, version])),
    };
  }

  private collectReferenceIds(value: unknown, target: Set<string>): void {
    if (typeof value === 'string') {
      target.add(value);
      return;
    }
    if (!Array.isArray(value)) return;

    for (const id of value) {
      if (typeof id === 'string') target.add(id);
    }
  }

  private referenceIds(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string');
  }

  private uniqueReferenceIds(value: unknown): string[] {
    return [...new Set(this.referenceIds(value))];
  }

  private async recordFieldActivity(
    issueId: string,
    userId: string,
    field: CustomField,
    oldValue: unknown,
    newValue: unknown,
    tx?: Tx,
    references?: DisplayReferences,
  ): Promise<void> {
    const resolvedReferences = references ?? await this.loadDisplayReferences([
      { field, value: oldValue },
      { field, value: newValue },
    ]);
    const fromDisplay = await this.formatForActivity(field, oldValue, resolvedReferences);
    const toDisplay = await this.formatForActivity(field, newValue, resolvedReferences);

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
    displayReferences?: DisplayReferences,
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
        if (displayReferences) {
          return displayReferences.usersById.get(value as string)?.name ?? String(value);
        }
        const [user] = await this.usersRepo.findNameRefsByIds([value as string]);
        return user?.name ?? String(value);
      }
      case CustomFieldType.MULTI_USER: {
        if (displayReferences) {
          return this.uniqueReferenceIds(value)
            .map((id) => displayReferences.usersById.get(id)?.name)
            .filter((name): name is string => name !== undefined)
            .join(', ');
        }
        const users = await this.usersRepo.findNameRefsByIds(value as string[]);
        return users.map((u) => u.name).join(', ');
      }
      case CustomFieldType.VERSION: {
        if (displayReferences) {
          return displayReferences.versionsById.get(value as string)?.name ?? String(value);
        }
        const [ver] = await this.versionsRepo.findManyByIds([value as string]);
        return ver?.name ?? String(value);
      }
      case CustomFieldType.MULTI_VERSION: {
        if (displayReferences) {
          return this.uniqueReferenceIds(value)
            .map((id) => displayReferences.versionsById.get(id)?.name)
            .filter((name): name is string => name !== undefined)
            .join(', ');
        }
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
    displayReferences?: DisplayReferences,
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
        if (displayReferences) {
          const user = displayReferences.usersById.get(value as string);
          return user ? { type: 'user', user } : null;
        }
        const [user] = await this.usersRepo.findPublicRefsByIds([value as string]);
        return user ? { type: 'user', user } : null;
      }
      case CustomFieldType.MULTI_USER: {
        if (displayReferences) {
          const users = this.uniqueReferenceIds(value)
            .map((id) => displayReferences.usersById.get(id))
            .filter((user): user is UserDisplayReference => user !== undefined);
          return { type: 'multi_user', users };
        }
        const users = await this.usersRepo.findPublicRefsByIds(value as string[]);
        return { type: 'multi_user', users };
      }
      case CustomFieldType.VERSION: {
        if (displayReferences) {
          const version = displayReferences.versionsById.get(value as string);
          return version ? { type: 'version', version } : null;
        }
        const [ver] = await this.versionsRepo.findManyByIds([value as string]);
        return ver ? { type: 'version', version: ver } : null;
      }
      case CustomFieldType.MULTI_VERSION: {
        if (displayReferences) {
          const versions = this.uniqueReferenceIds(value)
            .map((id) => displayReferences.versionsById.get(id))
            .filter((version): version is VersionDisplayReference => version !== undefined);
          return { type: 'multi_version', versions };
        }
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
    displayReferences?: DisplayReferences,
  ): Promise<CustomFieldValue> {
    const displayValue = await this.buildDisplayValue(field, value, displayReferences);
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
