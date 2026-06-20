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
    if (rawValue === null || rawValue === undefined) {
      if (field.isRequired) {
        throw new ValidationError(ErrorCode.FIELD_REQUIRED, `Field "${field.name}" is required`);
      }
      return null;
    }

    const config = getFieldConfig(field);

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
      case CustomFieldType.USER:
        return this.validateUser(rawValue, projectId, false);
      case CustomFieldType.MULTI_USER:
        return this.validateUser(rawValue, projectId, true);
      case CustomFieldType.VERSION:
        return this.validateVersion(rawValue, projectId, false);
      case CustomFieldType.MULTI_VERSION:
        return this.validateVersion(rawValue, projectId, true);
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

  private async validateUser(
    value: unknown,
    projectId: string,
    multi: boolean,
  ): Promise<string | string[]> {
    if (multi && (!Array.isArray(value) || value.length === 0)) {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected a non-empty array of user IDs',
      );
    }
    if (!multi && typeof value !== 'string') {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected a user ID string',
      );
    }

    const ids = multi ? (value as string[]) : [value as string];
    const members = await this.membersRepo.filterMembersByUserIds(projectId, ids);

    if (members.length !== ids.length) {
      throw new ValidationError(
        ErrorCode.FIELD_USER_NOT_PROJECT_MEMBER,
        'One or more users are not members of this project',
      );
    }

    return multi ? ids : ids[0];
  }

  private async validateVersion(
    value: unknown,
    projectId: string,
    multi: boolean,
  ): Promise<string | string[]> {
    if (multi && (!Array.isArray(value) || value.length === 0)) {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected a non-empty array of version IDs',
      );
    }
    if (!multi && typeof value !== 'string') {
      throw new ValidationError(
        ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
        'Expected a version ID string',
      );
    }

    const ids = multi ? (value as string[]) : [value as string];
    const found = await this.versionsRepo.findIdsByProject(projectId, ids);

    if (found.length !== ids.length) {
      throw new ValidationError(
        ErrorCode.VERSION_NOT_FOUND,
        'One or more versions not found in this project',
      );
    }

    return multi ? ids : ids[0];
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
