import { Test, TestingModule } from '@nestjs/testing';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { CustomFieldType } from '@prisma/client';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsRepository } from './custom-fields.repository';
import { CustomFieldValuesRepository } from './custom-field-values.repository';
import { ErrorCode } from '@repo/shared/error-codes';
import type { CustomField } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;
  let fieldsRepo: Mocked<CustomFieldsRepository>;
  let valuesRepo: Mocked<CustomFieldValuesRepository>;

  const projectId = 'proj-1';
  const fieldId = 'field-1';
  const userId = 'user-1';
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();

  const buildField = (overrides?: Partial<CustomField>): CustomField => ({
    id: fieldId,
    projectId,
    name: 'Priority Score',
    type: CustomFieldType.NUMBER,
    description: 'A numeric score',
    isRequired: false,
    ordinal: 0,
    config: { precision: 2 },
    valuesCount: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const buildEnumField = (overrides?: Partial<CustomField>): CustomField =>
    buildField({
      name: 'Status Label',
      type: CustomFieldType.ENUM,
      config: {
        options: [
          { id: 'opt-1', name: 'Alpha', color: '#ff0000', ordinal: 0 },
          { id: 'opt-2', name: 'Beta', color: '#00ff00', ordinal: 1 },
        ],
      },
      valuesCount: 5,
      ...overrides,
    });

  beforeEach(async () => {
    fieldsRepo = {
      findManyByProject: jest.fn(),
      findOneInProject: jest.fn(),
      findIdsInProject: jest.fn(),
      findRequiredInProject: jest.fn(),
      maxOrdinal: jest.fn().mockResolvedValue(-1),
      create: jest.fn(),
      update: jest.fn(),
      updateConfig: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
      updateOrdinalsAtomic: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<CustomFieldsRepository>;

    valuesRepo = {
      findValuesUsingOption: jest.fn().mockResolvedValue([]),
      clearOptionFromValues: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<CustomFieldValuesRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldsService,
        { provide: CustomFieldsRepository, useValue: fieldsRepo },
        { provide: CustomFieldValuesRepository, useValue: valuesRepo },
      ],
    }).compile();

    service = module.get(CustomFieldsService);
  });

  describe('findAll', () => {
    it('returns the project fields from the repository', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([
        buildField(),
        buildField({ id: 'field-2', name: 'Other' }),
      ]);

      const result = await service.findAll(projectId);

      expect(fieldsRepo.findManyByProject).toHaveBeenCalledWith(projectId);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Priority Score');
    });

    it('persists normalized enum config on read when legacy', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([
        buildEnumField({ config: { options: ['Legacy'] } }),
      ]);

      const result = await service.findAll(projectId);

      expect(fieldsRepo.updateConfig).toHaveBeenCalledWith(
        fieldId,
        expect.objectContaining({ options: expect.any(Array) }),
      );
      const opts = result[0].config.options as Array<{ name: string }>;
      expect(opts[0].name).toBe('Legacy');
    });

    it('does not persist when enum config is already normalized', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([buildEnumField()]);

      await service.findAll(projectId);

      expect(fieldsRepo.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the field when found', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildField());
      const result = await service.findOne(fieldId, projectId);
      expect(result.id).toBe(fieldId);
    });

    it('throws NotFoundError when missing', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(null);
      await expect(service.findOne(fieldId, projectId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('creates a field with next ordinal', async () => {
      fieldsRepo.maxOrdinal.mockResolvedValue(2);
      fieldsRepo.create.mockResolvedValue(buildField({ ordinal: 3 }));

      const result = await service.create(projectId, {
        name: 'New',
        type: CustomFieldType.NUMBER,
        description: null,
        config: { type: CustomFieldType.NUMBER, min: 0 },
      } as never);

      expect(fieldsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ordinal: 3, projectId }),
      );
      expect(result.ordinal).toBe(3);
    });

    it('assigns ids and ordinals to enum options on create', async () => {
      fieldsRepo.maxOrdinal.mockResolvedValue(-1);
      fieldsRepo.create.mockResolvedValue(buildEnumField());

      await service.create(projectId, {
        name: 'Status',
        type: CustomFieldType.ENUM,
        description: null,
        config: {
          type: CustomFieldType.ENUM,
          options: [{ name: 'A', color: null }, { name: 'B' }],
        },
      } as never);

      const config = fieldsRepo.create.mock.calls[0][0].config as {
        options: Array<{ id: string; name: string; ordinal: number }>;
      };
      expect(config.options).toHaveLength(2);
      expect(config.options[0]).toMatchObject({ name: 'A', ordinal: 0 });
      expect(config.options[0].id).toBeTruthy();
    });
  });

  describe('update', () => {
    it('merges config patches with existing config', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(
        buildField({ config: { maxLength: 100, unit: 'kg' } }),
      );
      fieldsRepo.update.mockResolvedValue(buildField());

      await service.update(fieldId, projectId, {
        name: 'Renamed',
        config: { maxLength: 200 },
      } as never);

      expect(fieldsRepo.update).toHaveBeenCalledWith(
        fieldId,
        expect.objectContaining({
          name: 'Renamed',
          config: { maxLength: 200, unit: 'kg' },
        }),
      );
    });

    it('throws NotFoundError for missing field', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(null);
      await expect(
        service.update(fieldId, projectId, { name: 'x' } as never),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('softDelete', () => {
    it('soft-deletes when field exists', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildField());
      await service.softDelete(fieldId, projectId, userId);
      expect(fieldsRepo.softDelete).toHaveBeenCalledWith(fieldId, userId);
    });

    it('throws when missing', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(null);
      await expect(
        service.softDelete(fieldId, projectId, userId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('reorder', () => {
    it('reorders fields atomically when all ids belong to the project', async () => {
      fieldsRepo.findIdsInProject.mockResolvedValue(['a', 'b']);
      fieldsRepo.findManyByProject.mockResolvedValue([]);

      await service.reorder(projectId, {
        ordinals: [
          { id: 'a', ordinal: 0 },
          { id: 'b', ordinal: 1 },
        ],
      } as never);

      expect(fieldsRepo.updateOrdinalsAtomic).toHaveBeenCalledWith([
        { id: 'a', ordinal: 0 },
        { id: 'b', ordinal: 1 },
      ]);
    });

    it('throws ValidationError when ids do not match', async () => {
      fieldsRepo.findIdsInProject.mockResolvedValue(['a']);

      await expect(
        service.reorder(projectId, {
          ordinals: [
            { id: 'a', ordinal: 0 },
            { id: 'b', ordinal: 1 },
          ],
        } as never),
      ).rejects.toThrow(ValidationError);
      expect(fieldsRepo.updateOrdinalsAtomic).not.toHaveBeenCalled();
    });
  });

  describe('addEnumOption', () => {
    it('appends a new option with next ordinal', async () => {
      const field = buildEnumField();
      fieldsRepo.findOneInProject.mockResolvedValue(field);
      fieldsRepo.update.mockResolvedValue(field);

      await service.addEnumOption(fieldId, projectId, {
        name: 'Gamma',
        color: '#0000ff',
      } as never);

      const config = fieldsRepo.update.mock.calls[0][1].config as {
        options: Array<{ name: string; ordinal: number }>;
      };
      expect(config.options).toHaveLength(3);
      expect(config.options[2]).toMatchObject({ name: 'Gamma', ordinal: 2 });
    });

    it('throws when field is not enum', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildField());
      await expect(
        service.addEnumOption(fieldId, projectId, { name: 'x' } as never),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateEnumOption', () => {
    it('updates name and color of an existing option', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildEnumField());
      fieldsRepo.update.mockResolvedValue(buildEnumField());

      await service.updateEnumOption(fieldId, projectId, 'opt-1', {
        name: 'Renamed',
        color: '#123456',
      } as never);

      const config = fieldsRepo.update.mock.calls[0][1].config as {
        options: Array<{ id: string; name: string; color: string }>;
      };
      const opt = config.options.find((o) => o.id === 'opt-1');
      expect(opt).toMatchObject({ name: 'Renamed', color: '#123456' });
    });

    it('throws NotFoundError when option missing', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildEnumField());
      await expect(
        service.updateEnumOption(fieldId, projectId, 'missing', { name: 'x' } as never),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteEnumOption', () => {
    it('deletes option when not in use', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildEnumField());
      valuesRepo.findValuesUsingOption.mockResolvedValue([]);

      await service.deleteEnumOption(fieldId, projectId, 'opt-1', false);

      expect(fieldsRepo.updateConfig).toHaveBeenCalled();
      expect(valuesRepo.clearOptionFromValues).not.toHaveBeenCalled();
    });

    it('throws ConflictError when in use without force', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildEnumField());
      valuesRepo.findValuesUsingOption.mockResolvedValue([
        { id: 'v1', issueId: 'i1', value: 'opt-1' },
      ]);

      try {
        await service.deleteEnumOption(fieldId, projectId, 'opt-1', false);
        fail('Expected ConflictError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        expect((err as ConflictError).code).toBe(ErrorCode.ENUM_OPTION_IN_USE);
      }
    });

    it('clears option from values and deletes when force=true', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildEnumField());
      valuesRepo.findValuesUsingOption.mockResolvedValue([
        { id: 'v1', issueId: 'i1', value: 'opt-1' },
      ]);

      await service.deleteEnumOption(fieldId, projectId, 'opt-1', true);

      expect(valuesRepo.clearOptionFromValues).toHaveBeenCalledWith(fieldId, 'opt-1', false);
      expect(fieldsRepo.updateConfig).toHaveBeenCalled();
    });

    it('uses multi=true for MULTI_ENUM fields', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(
        buildEnumField({ type: CustomFieldType.MULTI_ENUM }),
      );
      valuesRepo.findValuesUsingOption.mockResolvedValue([
        { id: 'v1', issueId: 'i1', value: ['opt-1'] },
      ]);

      await service.deleteEnumOption(fieldId, projectId, 'opt-1', true);

      expect(valuesRepo.findValuesUsingOption).toHaveBeenCalledWith(fieldId, 'opt-1', true);
      expect(valuesRepo.clearOptionFromValues).toHaveBeenCalledWith(fieldId, 'opt-1', true);
    });
  });

  describe('reorderEnumOptions', () => {
    it('reorders enum options by ordinal', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(buildEnumField());
      fieldsRepo.update.mockResolvedValue(buildEnumField());

      await service.reorderEnumOptions(fieldId, projectId, {
        ordinals: [
          { id: 'opt-1', ordinal: 1 },
          { id: 'opt-2', ordinal: 0 },
        ],
      } as never);

      const config = fieldsRepo.update.mock.calls[0][1].config as {
        options: Array<{ id: string; ordinal: number }>;
      };
      expect(config.options[0].id).toBe('opt-2');
      expect(config.options[1].id).toBe('opt-1');
    });
  });
});
