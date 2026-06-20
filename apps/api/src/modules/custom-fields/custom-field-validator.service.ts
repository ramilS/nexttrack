import { Injectable } from '@nestjs/common';
import { ValidationError } from '@/common/errors/domain.errors';
import { CustomFieldType } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import type { CustomField } from '@repo/shared/schemas';
import {
  CustomFieldConfig,
  getFieldConfig,
} from './custom-fields.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { VersionsRepository } from '@/modules/versions/versions.repository';
import { parsePeriodString } from './period-parser';

@Injectable()
export class CustomFieldValidatorService {
  constructor(
    private membersRepo: ProjectMembersRepository,
    private versionsRepo: VersionsRepository,
  ) {}

  async validate(
    field: CustomField,
    rawValue: unknown,
    projectId: string,
  ): Promise<unknown> {
    const [result] = await this.validateMany([{ field, value: rawValue }], projectId);
    return result.validatedValue;
  }

  /**
   * Validates a batch of field values with at most ONE membership lookup and
   * ONE version lookup for the whole set: the project-scoped existence checks
   * for USER/VERSION references are collected across all fields and resolved
   * in a single query each, instead of one round-trip per field (which would
   * hold the issue-creation transaction open for every reference field).
   */
  async validateMany(
    items: Array<{ field: CustomField; value: unknown }>,
    projectId: string,
  ): Promise<Array<{ field: CustomField; validatedValue: unknown }>> {
    const userIds = new Set<string>();
    const versionIds = new Set<string>();

    // Phase 1 — synchronous shape/type validation. USER/VERSION references are
    // extracted here and verified for existence after the batched lookups.
    const prepared = items.map((item) =>
      this.prepareValue(item.field, item.value, userIds, versionIds),
    );

    // Phase 2 — one query per reference kind for the entire batch.
    const [members, versions] = await Promise.all([
      userIds.size > 0
        ? this.membersRepo.filterMembersByUserIds(projectId, [...userIds])
        : Promise.resolve<string[]>([]),
      versionIds.size > 0
        ? this.versionsRepo.findIdsByProject(projectId, [...versionIds])
        : Promise.resolve<string[]>([]),
    ]);
    const memberSet = new Set(members);
    const versionSet = new Set(versions);

    // Phase 3 — confirm every referenced id resolved.
    return prepared.map((p) => {
      if (p.ref === 'user' && p.ids.some((id) => !memberSet.has(id))) {
        throw new ValidationError(
          ErrorCode.FIELD_USER_NOT_PROJECT_MEMBER,
          'One or more users are not members of this project',
        );
      }
      if (p.ref === 'version' && p.ids.some((id) => !versionSet.has(id))) {
        throw new ValidationError(
          ErrorCode.VERSION_NOT_FOUND,
          'One or more versions not found in this project',
        );
      }
      return { field: p.field, validatedValue: p.value };
    });
  }

  private prepareValue(
    field: CustomField,
    rawValue: unknown,
    userIds: Set<string>,
    versionIds: Set<string>,
  ): { field: CustomField; value: unknown; ref: 'user' | 'version' | 'none'; ids: string[] } {
    if (rawValue === null || rawValue === undefined) {
      if (field.isRequired) {
        throw new ValidationError(ErrorCode.FIELD_REQUIRED, `Field "${field.name}" is required`);
      }
      return { field, value: null, ref: 'none', ids: [] };
    }

    const config = getFieldConfig(field);

    switch (field.type) {
      case CustomFieldType.USER:
      case CustomFieldType.MULTI_USER: {
        const multi = field.type === CustomFieldType.MULTI_USER;
        const ids = this.extractUserIds(rawValue, multi);
        ids.forEach((id) => userIds.add(id));
        return { field, value: multi ? ids : ids[0], ref: 'user', ids };
      }
      case CustomFieldType.VERSION:
      case CustomFieldType.MULTI_VERSION: {
        const multi = field.type === CustomFieldType.MULTI_VERSION;
        const ids = this.extractVersionIds(rawValue, multi);
        ids.forEach((id) => versionIds.add(id));
        return { field, value: multi ? ids : ids[0], ref: 'version', ids };
      }
      default:
        return { field, value: this.validateScalar(field, config, rawValue), ref: 'none', ids: [] };
    }
  }

  private validateScalar(
    field: CustomField,
    config: CustomFieldConfig,
    rawValue: unknown,
  ): unknown {
    switch (field.type) {
      case CustomFieldType.TEXT:
        return this.validateText(config, rawValue);
      case CustomFieldType.NUMBER:
        return this.validateNumber(config, rawValue);
      case CustomFieldType.DATE:
        return this.validateDate(rawValue);
      case CustomFieldType.DATETIME:
        return this.validateDatetime(rawValue);
      case CustomFieldType.ENUM:
        return this.validateEnum(config, rawValue, false);
      case CustomFieldType.MULTI_ENUM:
        return this.validateEnum(config, rawValue, true);
      case CustomFieldType.PERIOD:
        return this.validatePeriod(rawValue);
      case CustomFieldType.URL:
        return this.validateUrl(rawValue);
      default:
        throw new ValidationError(
          ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
          `Unknown field type: ${field.type}`,
        );
    }
  }

  private validateText(config: CustomFieldConfig, value: unknown): string {
    if (typeof value !== 'string') {
      throw new ValidationError(ErrorCode.FIELD_VALUE_TYPE_MISMATCH, 'Expected a string value');
    }
    const maxLength = config?.maxLength ?? 1000;
    if (value.length > maxLength) {
      throw new ValidationError(
        ErrorCode.FIELD_TEXT_TOO_LONG,
        `Text exceeds maximum length of ${maxLength}`,
      );
    }
    return value;
  }

  private validateNumber(config: CustomFieldConfig, value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new ValidationError(ErrorCode.FIELD_VALUE_TYPE_MISMATCH, 'Expected a number value');
    }
    if (config?.min !== undefined && value < config.min) {
      throw new ValidationError(
        ErrorCode.FIELD_NUMBER_OUT_OF_RANGE,
        `Value must be >= ${config.min}`,
      );
    }
    if (config?.max !== undefined && value > config.max) {
      throw new ValidationError(
        ErrorCode.FIELD_NUMBER_OUT_OF_RANGE,
        `Value must be <= ${config.max}`,
      );
    }
    if (config?.precision === 0 && !Number.isInteger(value)) {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected an integer value',
      );
    }
    return value;
  }

  private validateDate(value: unknown): string {
    if (typeof value !== 'string') {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected a date string (YYYY-MM-DD)',
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Invalid date format, expected YYYY-MM-DD',
      );
    }
    return value;
  }

  private validateDatetime(value: unknown): string {
    if (typeof value !== 'string') {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected a datetime string (ISO 8601)',
      );
    }
    if (isNaN(Date.parse(value))) {
      throw new ValidationError(ErrorCode.FIELD_VALUE_TYPE_MISMATCH, 'Invalid datetime format');
    }
    return value;
  }

  private validateEnum(
    config: CustomFieldConfig,
    value: unknown,
    multi: boolean,
  ): string | string[] {
    const options = config?.options ?? [];
    const optionIds = options.map((o) => o.id);

    if (multi) {
      if (!Array.isArray(value) || value.length === 0) {
        throw new ValidationError(
          ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
          'Expected a non-empty array of option IDs',
        );
      }
      const invalid = value.filter((v) => !optionIds.includes(v));
      if (invalid.length > 0) {
        throw new ValidationError(
          ErrorCode.FIELD_INVALID_ENUM_OPTION,
          'Invalid enum option(s)',
          { invalidOptions: invalid },
        );
      }
      return value;
    }

    if (typeof value !== 'string' || !optionIds.includes(value)) {
      throw new ValidationError(ErrorCode.FIELD_INVALID_ENUM_OPTION, 'Invalid enum option');
    }
    return value;
  }

  private extractUserIds(value: unknown, multi: boolean): string[] {
    return this.extractIdList(value, multi, 'user');
  }

  private extractVersionIds(value: unknown, multi: boolean): string[] {
    return this.extractIdList(value, multi, 'version');
  }

  private extractIdList(
    value: unknown,
    multi: boolean,
    kind: 'user' | 'version',
  ): string[] {
    if (multi) {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((v) => typeof v === 'string')
      ) {
        throw new ValidationError(
          ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
          `Expected a non-empty array of ${kind} IDs`,
        );
      }
      return value;
    }
    if (typeof value !== 'string') {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        `Expected a ${kind} ID string`,
      );
    }
    return [value];
  }

  private validatePeriod(value: unknown): number {
    if (typeof value === 'number') {
      if (!isFinite(value) || value < 0) {
        throw new ValidationError(
          ErrorCode.FIELD_INVALID_PERIOD,
          'Period must be a non-negative number of minutes',
        );
      }
      return value;
    }

    if (typeof value === 'string') {
      const parsed = parsePeriodString(value);
      if (parsed === null) {
        throw new ValidationError(
          ErrorCode.FIELD_INVALID_PERIOD,
          'Invalid period format. Expected: "2w 3d 4h 30m"',
        );
      }
      return parsed;
    }

    throw new ValidationError(
      ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      'Expected a number (minutes) or period string',
    );
  }

  private validateUrl(value: unknown): string {
    if (typeof value !== 'string') {
      throw new ValidationError(ErrorCode.FIELD_VALUE_TYPE_MISMATCH, 'Expected a URL string');
    }

    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new ValidationError(ErrorCode.FIELD_VALUE_TYPE_MISMATCH, 'Invalid URL');
    }

    return value;
  }
}
