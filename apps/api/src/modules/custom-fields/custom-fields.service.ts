import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { CustomFieldType } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  CustomField,
  CreateCustomFieldParsed,
  UpdateCustomFieldInput,
  ReorderCustomFieldsInput,
  AddEnumOptionInput,
  UpdateEnumOptionInput,
  ReorderEnumOptionsInput,
} from '@repo/shared/schemas';
import { normalizeEnumConfig } from './normalize-enum-config';
import {
  CustomFieldsRepository,
  CustomFieldConfig,
  getFieldConfig,
} from './custom-fields.repository';
import { CustomFieldValuesRepository } from './custom-field-values.repository';
import { randomUUID } from 'crypto';

// Re-export so other modules (`CustomFieldValuesService`, validator) keep their
// existing import surface while the type/helper live in the repository.
export type { CustomFieldConfig };
export { getFieldConfig };

function isEnumType(type: CustomFieldType): boolean {
  return type === CustomFieldType.ENUM || type === CustomFieldType.MULTI_ENUM;
}

@Injectable()
export class CustomFieldsService {
  private readonly logger = new AppLogger(CustomFieldsService.name);

  constructor(
    private fieldsRepo: CustomFieldsRepository,
    private valuesRepo: CustomFieldValuesRepository,
  ) {}

  async findAll(projectId: string): Promise<CustomField[]> {
    const fields = await this.fieldsRepo.findManyByProject(projectId);
    return Promise.all(fields.map((f) => this.normalizedField(f)));
  }

  async findOne(fieldId: string, projectId: string): Promise<CustomField> {
    const field = await this.fieldsRepo.findOneInProject(fieldId, projectId);
    if (!field) {
      throw new NotFoundError(ErrorCode.FIELD_NOT_FOUND);
    }
    return this.normalizedField(field);
  }

  async create(
    projectId: string,
    dto: CreateCustomFieldParsed,
  ): Promise<CustomField> {
    const maxOrdinal = await this.fieldsRepo.maxOrdinal(projectId);
    const config = this.buildInitialConfig(dto);

    const created = await this.fieldsRepo.create({
      projectId,
      name: dto.name,
      type: dto.type,
      description: dto.description ?? null,
      isRequired: dto.isRequired ?? false,
      ordinal: maxOrdinal + 1,
      config,
    });

    this.logger.log('Custom field created', {
      fieldId: created.id,
      projectId,
      type: dto.type,
      isRequired: dto.isRequired ?? false,
    });

    return created;
  }

  async update(
    fieldId: string,
    projectId: string,
    dto: UpdateCustomFieldInput,
  ): Promise<CustomField> {
    const field = await this.fieldsRepo.findOneInProject(fieldId, projectId);
    if (!field) {
      throw new NotFoundError(ErrorCode.FIELD_NOT_FOUND);
    }

    const patch: Parameters<CustomFieldsRepository['update']>[1] = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.isRequired !== undefined) patch.isRequired = dto.isRequired;
    if (dto.config !== undefined) {
      patch.config = { ...getFieldConfig(field), ...dto.config };
    }

    this.logger.log('Updating custom field', {
      fieldId,
      projectId,
      fields: Object.keys(patch),
    });

    return this.fieldsRepo.update(fieldId, patch);
  }

  async softDelete(fieldId: string, projectId: string, userId: string): Promise<void> {
    const field = await this.fieldsRepo.findOneInProject(fieldId, projectId);
    if (!field) {
      throw new NotFoundError(ErrorCode.FIELD_NOT_FOUND);
    }
    await this.fieldsRepo.softDelete(fieldId, userId);

    this.logger.log('Custom field soft-deleted', { fieldId, projectId });
  }

  async reorder(
    projectId: string,
    dto: ReorderCustomFieldsInput,
  ): Promise<CustomField[]> {
    const fieldIds = dto.ordinals.map((o) => o.id);
    const matched = await this.fieldsRepo.findIdsInProject(fieldIds, projectId);

    if (matched.length !== fieldIds.length) {
      throw new ValidationError(
        ErrorCode.FIELD_NOT_FOUND,
        'Some field IDs do not belong to this project',
      );
    }

    await this.fieldsRepo.updateOrdinalsAtomic(dto.ordinals);

    this.logger.log('Custom fields reordered', {
      projectId,
      count: dto.ordinals.length,
    });

    return this.findAll(projectId);
  }

  // ─── Enum Options ──────────────────────────────────────────

  async addEnumOption(
    fieldId: string,
    projectId: string,
    dto: AddEnumOptionInput,
  ): Promise<CustomField> {
    const field = await this.assertEnumField(fieldId, projectId);
    const config = getFieldConfig(field);
    const options = config.options ?? [];

    const maxOrdinal = options.reduce((max, o) => Math.max(max, o.ordinal ?? 0), -1);

    const optionId = randomUUID();
    options.push({
      id: optionId,
      name: dto.name,
      color: dto.color ?? null,
      ordinal: maxOrdinal + 1,
    });

    this.logger.log('Enum option added', { fieldId, projectId, optionId });

    return this.fieldsRepo.update(fieldId, { config: { ...config, options } });
  }

  async updateEnumOption(
    fieldId: string,
    projectId: string,
    optionId: string,
    dto: UpdateEnumOptionInput,
  ): Promise<CustomField> {
    const field = await this.assertEnumField(fieldId, projectId);
    const config = getFieldConfig(field);
    const options = config.options ?? [];

    const idx = options.findIndex((o) => o.id === optionId);
    if (idx === -1) {
      throw new NotFoundError(ErrorCode.FIELD_INVALID_ENUM_OPTION);
    }

    if (dto.name !== undefined) options[idx].name = dto.name;
    if (dto.color !== undefined) options[idx].color = dto.color;

    this.logger.log('Enum option updated', {
      fieldId,
      projectId,
      optionId,
      fields: Object.keys(dto),
    });

    return this.fieldsRepo.update(fieldId, { config: { ...config, options } });
  }

  async deleteEnumOption(
    fieldId: string,
    projectId: string,
    optionId: string,
    force: boolean,
  ): Promise<void> {
    const field = await this.assertEnumField(fieldId, projectId);
    const config = getFieldConfig(field);
    const options = config.options ?? [];

    const idx = options.findIndex((o) => o.id === optionId);
    if (idx === -1) {
      throw new NotFoundError(ErrorCode.FIELD_INVALID_ENUM_OPTION);
    }

    const isMulti = field.type === CustomFieldType.MULTI_ENUM;
    const affectedValues = await this.valuesRepo.findValuesUsingOption(
      fieldId,
      optionId,
      isMulti,
    );

    if (affectedValues.length > 0 && !force) {
      throw new ConflictError(
        ErrorCode.ENUM_OPTION_IN_USE,
        `Option is used in ${affectedValues.length} issue(s)`,
        {
          affectedIssuesCount: affectedValues.length,
          affectedIssueIds: affectedValues.map((v) => v.issueId),
        },
      );
    }

    if (affectedValues.length > 0 && force) {
      await this.valuesRepo.clearOptionFromValues(fieldId, optionId, isMulti);
    }

    options.splice(idx, 1);
    await this.fieldsRepo.updateConfig(fieldId, { ...config, options });

    this.logger.log('Enum option deleted', {
      fieldId,
      projectId,
      optionId,
      force,
      clearedValues: force ? affectedValues.length : 0,
    });
  }

  async reorderEnumOptions(
    fieldId: string,
    projectId: string,
    dto: ReorderEnumOptionsInput,
  ): Promise<CustomField> {
    const field = await this.assertEnumField(fieldId, projectId);
    const config = getFieldConfig(field);
    const options = config.options ?? [];

    for (const { id, ordinal } of dto.ordinals) {
      const opt = options.find((o) => o.id === id);
      if (opt) opt.ordinal = ordinal;
    }
    options.sort((a, b) => a.ordinal - b.ordinal);

    return this.fieldsRepo.update(fieldId, { config: { ...config, options } });
  }

  // ─── Private ───────────────────────────────────────────────

  /**
   * Lazily migrates legacy enum config shapes (plain strings → objects) on read.
   * Persists the normalized config via the repository so the field is fixed
   * permanently after first read.
   */
  private async normalizedField(field: CustomField): Promise<CustomField> {
    if (!isEnumType(field.type)) return field;
    const { config, changed } = normalizeEnumConfig(field.config);
    if (!changed) return field;

    await this.fieldsRepo.updateConfig(field.id, config);
    return { ...field, config: config as CustomFieldConfig };
  }

  private async assertEnumField(
    fieldId: string,
    projectId: string,
  ): Promise<CustomField> {
    const field = await this.fieldsRepo.findOneInProject(fieldId, projectId);
    if (!field) {
      throw new NotFoundError(ErrorCode.FIELD_NOT_FOUND);
    }
    if (!isEnumType(field.type)) {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'This operation is only for ENUM/MULTI_ENUM fields',
      );
    }
    return field;
  }

  private buildInitialConfig(
    dto: CreateCustomFieldParsed,
  ): Record<string, unknown> {
    const config = { ...dto.config } as Record<string, unknown>;

    if (isEnumType(dto.type)) {
      const rawOptions =
        (config.options as Array<{ name: string; color?: string | null }>) ?? [];
      config.options = rawOptions.map((o, i) => ({
        id: randomUUID(),
        name: o.name,
        color: o.color ?? null,
        ordinal: i,
      }));
    }

    return config;
  }
}
