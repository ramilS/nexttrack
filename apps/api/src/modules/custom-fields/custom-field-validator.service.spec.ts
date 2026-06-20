import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError } from '@/common/errors/domain.errors';
import { CustomFieldValidatorService } from './custom-field-validator.service';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { VersionsRepository } from '@/modules/versions/versions.repository';
import { ErrorCode } from '@repo/shared/error-codes';
import type { CustomField } from '@repo/shared/schemas';

describe('CustomFieldValidatorService', () => {
  let service: CustomFieldValidatorService;
  let membersRepo: { filterMembersByUserIds: jest.Mock };
  let versionsRepo: { findIdsByProject: jest.Mock };

  const projectId = 'proj-1';

  // `type` is widened to `string` so tests can exercise the validator's
  // default/unknown-type branch with an out-of-enum value.
  const makeField = (
    overrides: Partial<Omit<CustomField, 'type'>> & { type?: string } = {},
  ) =>
    ({
      name: 'Test',
      type: 'TEXT',
      config: {},
      isRequired: false,
      ...overrides,
    }) as CustomField;

  beforeEach(async () => {
    membersRepo = { filterMembersByUserIds: jest.fn().mockResolvedValue([]) };
    versionsRepo = { findIdsByProject: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldValidatorService,
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: VersionsRepository, useValue: versionsRepo },
      ],
    }).compile();

    service = module.get(CustomFieldValidatorService);
  });

  // ─── null / undefined value ──────────────────────────────────

  describe('null/undefined value', () => {
    it('should return null when value is null and field is not required', async () => {
      const result = await service.validate(makeField(), null, projectId);
      expect(result).toBeNull();
    });

    it('should return null when value is undefined and field is not required', async () => {
      const result = await service.validate(makeField(), undefined, projectId);
      expect(result).toBeNull();
    });

    it('should throw FIELD_REQUIRED when value is null and field is required', async () => {
      const field = makeField({ isRequired: true });

      await expect(
        service.validate(field, null, projectId),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.validate(field, null, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_REQUIRED,
      });
    });

    it('should throw FIELD_REQUIRED when value is undefined and field is required', async () => {
      const field = makeField({ isRequired: true });

      await expect(
        service.validate(field, undefined, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_REQUIRED,
      });
    });
  });

  // ─── TEXT ────────────────────────────────────────────────────

  describe('TEXT', () => {
    const textField = (config: Record<string, unknown> = {}) =>
      makeField({ type: 'TEXT', config });

    it('should return the string value when valid', async () => {
      const result = await service.validate(textField(), 'hello', projectId);
      expect(result).toBe('hello');
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a string', async () => {
      await expect(
        service.validate(textField(), 123, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_TEXT_TOO_LONG when string exceeds maxLength from config', async () => {
      const field = textField({ maxLength: 5 });

      await expect(
        service.validate(field, 'toolong', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_TEXT_TOO_LONG,
      });
    });

    it('should allow text up to maxLength', async () => {
      const field = textField({ maxLength: 5 });
      const result = await service.validate(field, 'abcde', projectId);
      expect(result).toBe('abcde');
    });

    it('should default maxLength to 1000 when config has no maxLength', async () => {
      const longString = 'a'.repeat(1001);

      await expect(
        service.validate(textField(), longString, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_TEXT_TOO_LONG,
      });
    });

    it('should accept a string of exactly 1000 chars with default maxLength', async () => {
      const result = await service.validate(
        textField(),
        'a'.repeat(1000),
        projectId,
      );
      expect(result).toHaveLength(1000);
    });
  });

  // ─── NUMBER ──────────────────────────────────────────────────

  describe('NUMBER', () => {
    const numberField = (config: Record<string, unknown> = {}) =>
      makeField({ type: 'NUMBER', config });

    it('should return the number when valid', async () => {
      const result = await service.validate(numberField(), 42, projectId);
      expect(result).toBe(42);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a number', async () => {
      await expect(
        service.validate(numberField(), 'abc', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for NaN', async () => {
      await expect(
        service.validate(numberField(), NaN, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for Infinity', async () => {
      await expect(
        service.validate(numberField(), Infinity, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_NUMBER_OUT_OF_RANGE when below min', async () => {
      const field = numberField({ min: 0 });

      await expect(
        service.validate(field, -1, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_NUMBER_OUT_OF_RANGE,
      });
    });

    it('should throw FIELD_NUMBER_OUT_OF_RANGE when above max', async () => {
      const field = numberField({ max: 100 });

      await expect(
        service.validate(field, 101, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_NUMBER_OUT_OF_RANGE,
      });
    });

    it('should accept value equal to min', async () => {
      const result = await service.validate(
        numberField({ min: 5 }),
        5,
        projectId,
      );
      expect(result).toBe(5);
    });

    it('should accept value equal to max', async () => {
      const result = await service.validate(
        numberField({ max: 100 }),
        100,
        projectId,
      );
      expect(result).toBe(100);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for non-integer when precision=0', async () => {
      const field = numberField({ precision: 0 });

      await expect(
        service.validate(field, 3.14, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should accept integer when precision=0', async () => {
      const result = await service.validate(
        numberField({ precision: 0 }),
        7,
        projectId,
      );
      expect(result).toBe(7);
    });

    it('should accept decimal when precision is not 0', async () => {
      const result = await service.validate(
        numberField({ precision: 2 }),
        3.14,
        projectId,
      );
      expect(result).toBe(3.14);
    });
  });

  // ─── DATE ────────────────────────────────────────────────────

  describe('DATE', () => {
    const dateField = () => makeField({ type: 'DATE' });

    it('should return the date string when valid YYYY-MM-DD', async () => {
      const result = await service.validate(dateField(), '2026-03-07', projectId);
      expect(result).toBe('2026-03-07');
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a string', async () => {
      await expect(
        service.validate(dateField(), 12345, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for wrong format', async () => {
      await expect(
        service.validate(dateField(), '03/07/2026', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for invalid date like 2026-13-01', async () => {
      await expect(
        service.validate(dateField(), '2026-13-01', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for datetime string', async () => {
      await expect(
        service.validate(dateField(), '2026-03-07T10:00:00Z', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });
  });

  // ─── DATETIME ────────────────────────────────────────────────

  describe('DATETIME', () => {
    const dtField = () => makeField({ type: 'DATETIME' });

    it('should return the datetime string when valid ISO 8601', async () => {
      const iso = '2026-03-07T10:30:00.000Z';
      const result = await service.validate(dtField(), iso, projectId);
      expect(result).toBe(iso);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a string', async () => {
      await expect(
        service.validate(dtField(), 12345, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for unparseable datetime', async () => {
      await expect(
        service.validate(dtField(), 'not-a-date', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });
  });

  // ─── ENUM ────────────────────────────────────────────────────

  describe('ENUM', () => {
    const enumField = () =>
      makeField({
        type: 'ENUM',
        config: {
          options: [
            { id: 'opt-1', name: 'Alpha' },
            { id: 'opt-2', name: 'Beta' },
          ],
        },
      });

    it('should return the option ID when valid', async () => {
      const result = await service.validate(enumField(), 'opt-1', projectId);
      expect(result).toBe('opt-1');
    });

    it('should throw FIELD_INVALID_ENUM_OPTION when ID not in options', async () => {
      await expect(
        service.validate(enumField(), 'opt-missing', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_ENUM_OPTION,
      });
    });

    it('should throw FIELD_INVALID_ENUM_OPTION when value is not a string', async () => {
      await expect(
        service.validate(enumField(), 123, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_ENUM_OPTION,
      });
    });
  });

  // ─── MULTI_ENUM ──────────────────────────────────────────────

  describe('MULTI_ENUM', () => {
    const multiEnumField = () =>
      makeField({
        type: 'MULTI_ENUM',
        config: {
          options: [
            { id: 'opt-1', name: 'Alpha' },
            { id: 'opt-2', name: 'Beta' },
            { id: 'opt-3', name: 'Gamma' },
          ],
        },
      });

    it('should return the array of option IDs when valid', async () => {
      const result = await service.validate(
        multiEnumField(),
        ['opt-1', 'opt-3'],
        projectId,
      );
      expect(result).toEqual(['opt-1', 'opt-3']);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not an array', async () => {
      await expect(
        service.validate(multiEnumField(), 'opt-1', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when array is empty', async () => {
      await expect(
        service.validate(multiEnumField(), [], projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_INVALID_ENUM_OPTION when some IDs are invalid', async () => {
      await expect(
        service.validate(multiEnumField(), ['opt-1', 'opt-bad'], projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_ENUM_OPTION,
      });
    });
  });

  // ─── USER ────────────────────────────────────────────────────

  describe('USER', () => {
    const userField = () => makeField({ type: 'USER' });

    it('should return the userId when user is a project member', async () => {
      membersRepo.filterMembersByUserIds.mockResolvedValue(['user-1']);

      const result = await service.validate(userField(), 'user-1', projectId);

      expect(result).toBe('user-1');
      expect(membersRepo.filterMembersByUserIds).toHaveBeenCalledWith(projectId, ['user-1']);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a string', async () => {
      await expect(
        service.validate(userField(), 123, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_USER_NOT_PROJECT_MEMBER when user not found', async () => {
      membersRepo.filterMembersByUserIds.mockResolvedValue([]);

      await expect(
        service.validate(userField(), 'user-missing', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_USER_NOT_PROJECT_MEMBER,
      });
    });
  });

  // ─── MULTI_USER ──────────────────────────────────────────────

  describe('MULTI_USER', () => {
    const multiUserField = () => makeField({ type: 'MULTI_USER' });

    it('should return userIds when all are project members', async () => {
      membersRepo.filterMembersByUserIds.mockResolvedValue(['user-1', 'user-2']);

      const result = await service.validate(
        multiUserField(),
        ['user-1', 'user-2'],
        projectId,
      );

      expect(result).toEqual(['user-1', 'user-2']);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not an array', async () => {
      await expect(
        service.validate(multiUserField(), 'user-1', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when array is empty', async () => {
      await expect(
        service.validate(multiUserField(), [], projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_USER_NOT_PROJECT_MEMBER when some users not found', async () => {
      membersRepo.filterMembersByUserIds.mockResolvedValue(['user-1']);

      await expect(
        service.validate(
          multiUserField(),
          ['user-1', 'user-missing'],
          projectId,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_USER_NOT_PROJECT_MEMBER,
      });
    });
  });

  // ─── VERSION ─────────────────────────────────────────────────

  describe('VERSION', () => {
    const versionField = () => makeField({ type: 'VERSION' });

    it('should return the versionId when valid', async () => {
      versionsRepo.findIdsByProject.mockResolvedValue(['ver-1']);

      const result = await service.validate(versionField(), 'ver-1', projectId);

      expect(result).toBe('ver-1');
      expect(versionsRepo.findIdsByProject).toHaveBeenCalledWith(projectId, ['ver-1']);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a string', async () => {
      await expect(
        service.validate(versionField(), 123, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw VERSION_NOT_FOUND when version does not exist', async () => {
      versionsRepo.findIdsByProject.mockResolvedValue([]);

      await expect(
        service.validate(versionField(), 'ver-missing', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.VERSION_NOT_FOUND,
      });
    });
  });

  // ─── MULTI_VERSION ───────────────────────────────────────────

  describe('MULTI_VERSION', () => {
    const multiVersionField = () => makeField({ type: 'MULTI_VERSION' });

    it('should return versionIds when all exist', async () => {
      versionsRepo.findIdsByProject.mockResolvedValue(['ver-1', 'ver-2']);

      const result = await service.validate(
        multiVersionField(),
        ['ver-1', 'ver-2'],
        projectId,
      );

      expect(result).toEqual(['ver-1', 'ver-2']);
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not an array', async () => {
      await expect(
        service.validate(multiVersionField(), 'ver-1', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when array is empty', async () => {
      await expect(
        service.validate(multiVersionField(), [], projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw VERSION_NOT_FOUND when some versions not found', async () => {
      versionsRepo.findIdsByProject.mockResolvedValue(['ver-1']);

      await expect(
        service.validate(
          multiVersionField(),
          ['ver-1', 'ver-missing'],
          projectId,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.VERSION_NOT_FOUND,
      });
    });
  });

  // ─── PERIOD ──────────────────────────────────────────────────

  describe('PERIOD', () => {
    const periodField = () => makeField({ type: 'PERIOD' });

    it('should return the number when value is a non-negative finite number', async () => {
      const result = await service.validate(periodField(), 120, projectId);
      expect(result).toBe(120);
    });

    it('should return 0 for zero', async () => {
      const result = await service.validate(periodField(), 0, projectId);
      expect(result).toBe(0);
    });

    it('should throw FIELD_INVALID_PERIOD for negative number', async () => {
      await expect(
        service.validate(periodField(), -5, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_PERIOD,
      });
    });

    it('should throw FIELD_INVALID_PERIOD for Infinity', async () => {
      await expect(
        service.validate(periodField(), Infinity, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_PERIOD,
      });
    });

    it('should parse a period string like "2w 3d"', async () => {
      const result = await service.validate(periodField(), '2w 3d', projectId);
      expect(result).toBe(2 * 2400 + 3 * 480);
    });

    it('should throw FIELD_INVALID_PERIOD for unparseable period string', async () => {
      await expect(
        service.validate(periodField(), 'invalid', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_PERIOD,
      });
    });

    it('should throw FIELD_INVALID_PERIOD for "0w" (resolves to null)', async () => {
      await expect(
        service.validate(periodField(), '0w', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_INVALID_PERIOD,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for boolean value', async () => {
      await expect(
        service.validate(periodField(), true, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });
  });

  // ─── URL ─────────────────────────────────────────────────────

  describe('URL', () => {
    const urlField = () => makeField({ type: 'URL' });

    it('should return the URL string for valid http URL', async () => {
      const result = await service.validate(
        urlField(),
        'http://example.com',
        projectId,
      );
      expect(result).toBe('http://example.com');
    });

    it('should return the URL string for valid https URL', async () => {
      const result = await service.validate(
        urlField(),
        'https://example.com/path?q=1',
        projectId,
      );
      expect(result).toBe('https://example.com/path?q=1');
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH when value is not a string', async () => {
      await expect(
        service.validate(urlField(), 123, projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for invalid URL', async () => {
      await expect(
        service.validate(urlField(), 'not-a-url', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });

    it('should throw FIELD_VALUE_TYPE_MISMATCH for ftp protocol', async () => {
      await expect(
        service.validate(urlField(), 'ftp://example.com', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });
  });

  // ─── Unknown type ────────────────────────────────────────────

  describe('unknown field type', () => {
    it('should throw FIELD_VALUE_TYPE_MISMATCH for unknown type', async () => {
      const field = makeField({ type: 'UNKNOWN_TYPE' });

      await expect(
        service.validate(field, 'anything', projectId),
      ).rejects.toMatchObject({
        code: ErrorCode.FIELD_VALUE_TYPE_MISMATCH,
      });
    });
  });
});
