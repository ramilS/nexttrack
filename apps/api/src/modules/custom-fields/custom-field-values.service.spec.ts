import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { CustomFieldType } from '@prisma/client';
import { CustomFieldValuesService } from './custom-field-values.service';
import { CustomFieldValidatorService } from './custom-field-validator.service';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { CustomFieldsRepository } from './custom-fields.repository';
import { CustomFieldValuesRepository } from './custom-field-values.repository';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { VersionsRepository } from '@/modules/versions/versions.repository';
import { TransactionService } from '@/common/repository/transaction.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import type { Tx } from '@/common/repository/tx.types';
import type { CustomField } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('CustomFieldValuesService', () => {
  let service: CustomFieldValuesService;
  let fieldsRepo: Mocked<CustomFieldsRepository>;
  let valuesRepo: Mocked<CustomFieldValuesRepository>;
  let issuesRepo: Mocked<IssuesRepository>;
  let validator: { validate: jest.Mock; validateMany: jest.Mock };
  let activities: { recordOne: jest.Mock; record: jest.Mock };
  let indexerHooks: { onIssueChanged: jest.Mock };
  let background: { run: jest.Mock };

  const projectId = 'proj-1';
  const issueId = 'issue-1';
  const userId = 'user-1';

  const textField: CustomField = {
    id: 'f1',
    projectId,
    name: 'Summary',
    type: CustomFieldType.TEXT,
    description: null,
    isRequired: false,
    ordinal: 0,
    config: {},
    valuesCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    fieldsRepo = {
      findManyByProject: jest.fn(),
      findOneInProject: jest.fn(),
      findRequiredInProject: jest.fn(),
      updateConfig: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<CustomFieldsRepository>;

    valuesRepo = {
      findByIssueAndFields: jest.fn().mockResolvedValue([]),
      findByIssueAndField: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      createMany: jest.fn().mockResolvedValue(undefined),
      deleteById: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<CustomFieldValuesRepository>;

    issuesRepo = {
      findProjectIdById: jest.fn(),
      touchUpdatedAt: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IssuesRepository>;

    validator = { validate: jest.fn(), validateMany: jest.fn() };
    activities = {
      recordOne: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(undefined),
    };
    indexerHooks = { onIssueChanged: jest.fn().mockResolvedValue(undefined) };
    // Invoke the task synchronously so the test can assert the re-index call.
    background = { run: jest.fn((task: () => unknown) => void task()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldValuesService,
        { provide: CustomFieldsRepository, useValue: fieldsRepo },
        { provide: CustomFieldValuesRepository, useValue: valuesRepo },
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: UsersReader, useValue: { findPublicRefsByIds: jest.fn(), findNameRefsByIds: jest.fn() } },
        { provide: VersionsRepository, useValue: { findManyByIds: jest.fn() } },
        { provide: CustomFieldValidatorService, useValue: validator },
        { provide: ActivitiesService, useValue: activities },
        {
          provide: TransactionService,
          useValue: { run: (fn: (tx: Tx) => unknown) => fn({} as Tx) },
        },
        { provide: IndexerHooksService, useValue: indexerHooks },
        { provide: BackgroundTasks, useValue: background },
      ],
    }).compile();

    service = module.get(CustomFieldValuesService);
  });

  describe('getFieldsForIssue', () => {
    it('returns fields with their stored values and display values', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([textField]);
      valuesRepo.findByIssueAndFields.mockResolvedValue([
        { customFieldId: 'f1', value: 'hello' },
      ]);

      const result = await service.getFieldsForIssue(issueId, projectId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        fieldId: 'f1',
        value: 'hello',
        displayValue: { type: 'text', text: 'hello' },
      });
    });

    it('returns null value when field has no stored value', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([textField]);
      valuesRepo.findByIssueAndFields.mockResolvedValue([]);

      const result = await service.getFieldsForIssue(issueId, projectId);

      expect(result[0].value).toBeNull();
      expect(result[0].displayValue).toBeNull();
    });

    it('returns empty array when no fields exist', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([]);
      const result = await service.getFieldsForIssue(issueId, projectId);
      expect(result).toEqual([]);
    });
  });

  describe('setFieldValue', () => {
    it('throws NotFoundError when field is missing', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(null);
      await expect(
        service.setFieldValue(issueId, 'f1', 'val', userId, projectId),
      ).rejects.toThrow(NotFoundError);
    });

    it('upserts a validated value and records activity', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(textField);
      validator.validate.mockResolvedValue('validated');

      await service.setFieldValue(issueId, 'f1', 'raw', userId, projectId);

      expect(validator.validate).toHaveBeenCalledWith(textField, 'raw', projectId);
      expect(valuesRepo.upsert).toHaveBeenCalledWith(issueId, 'f1', 'validated', expect.anything());
      expect(activities.recordOne).toHaveBeenCalled();
      expect(issuesRepo.touchUpdatedAt).toHaveBeenCalledWith(issueId, expect.anything());
      // Custom field values are part of the ES doc — the change must re-index.
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith(issueId, 'field_value');
    });

    it('deletes existing value when setting null on non-required field', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(textField);
      valuesRepo.findByIssueAndField.mockResolvedValue({
        id: 'cfv-1',
        issueId,
        customFieldId: 'f1',
        value: 'old',
      });

      await service.setFieldValue(issueId, 'f1', null, userId, projectId);

      expect(valuesRepo.deleteById).toHaveBeenCalledWith('cfv-1', expect.anything());
    });

    it('throws ValidationError when setting null on required field', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue({ ...textField, isRequired: true });

      await expect(
        service.setFieldValue(issueId, 'f1', null, userId, projectId),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('clearFieldValue', () => {
    it('throws NotFoundError when field is missing', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(null);
      await expect(
        service.clearFieldValue(issueId, 'f1', userId, projectId),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when clearing required field', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue({ ...textField, isRequired: true });

      await expect(
        service.clearFieldValue(issueId, 'f1', userId, projectId),
      ).rejects.toThrow(ValidationError);
    });

    it('deletes existing value and records activity', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(textField);
      valuesRepo.findByIssueAndField.mockResolvedValue({
        id: 'cfv-1',
        issueId,
        customFieldId: 'f1',
        value: 'old',
      });

      await service.clearFieldValue(issueId, 'f1', userId, projectId);

      expect(valuesRepo.deleteById).toHaveBeenCalledWith('cfv-1', expect.anything());
      expect(activities.recordOne).toHaveBeenCalled();
    });

    it('does nothing when value does not exist', async () => {
      fieldsRepo.findOneInProject.mockResolvedValue(textField);
      valuesRepo.findByIssueAndField.mockResolvedValue(null);

      await service.clearFieldValue(issueId, 'f1', userId, projectId);

      expect(valuesRepo.deleteById).not.toHaveBeenCalled();
      expect(activities.recordOne).not.toHaveBeenCalled();
    });
  });

  describe('validateRequiredFields', () => {
    it('passes when no required fields exist', async () => {
      fieldsRepo.findRequiredInProject.mockResolvedValue([]);
      await expect(service.validateRequiredFields(projectId, [])).resolves.not.toThrow();
    });

    it('throws when required fields are missing', async () => {
      fieldsRepo.findRequiredInProject.mockResolvedValue([{ id: 'f1', name: 'Required' }]);

      await expect(service.validateRequiredFields(projectId, [])).rejects.toThrow(
        ValidationError,
      );
    });

    it('passes when all required fields are provided', async () => {
      fieldsRepo.findRequiredInProject.mockResolvedValue([{ id: 'f1', name: 'Required' }]);

      await expect(
        service.validateRequiredFields(projectId, [{ fieldId: 'f1', value: 'x' }]),
      ).resolves.not.toThrow();
    });
  });

  describe('setInitialFieldValues', () => {
    const tx = {} as never;

    it('persists all validated values and activities in one batched write', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([textField]);
      validator.validateMany.mockResolvedValue([
        { field: textField, validatedValue: 'validated' },
      ]);

      await service.setInitialFieldValues(
        issueId,
        projectId,
        userId,
        [{ fieldId: 'f1', value: 'x' }],
        tx,
      );

      expect(valuesRepo.createMany).toHaveBeenCalledWith(
        issueId,
        [{ fieldId: 'f1', value: 'validated' }],
        tx,
      );
      expect(activities.record).toHaveBeenCalledWith(
        issueId,
        userId,
        [expect.objectContaining({ payload: expect.objectContaining({ fieldId: 'f1' }) })],
        tx,
      );
      expect(issuesRepo.touchUpdatedAt).not.toHaveBeenCalled();
    });

    it('skips null values for optional fields without writing', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([textField]);
      validator.validateMany.mockResolvedValue([
        { field: textField, validatedValue: null },
      ]);

      await service.setInitialFieldValues(
        issueId,
        projectId,
        userId,
        [{ fieldId: 'f1', value: null }],
        tx,
      );

      expect(valuesRepo.createMany).not.toHaveBeenCalled();
      expect(activities.record).not.toHaveBeenCalled();
    });

    it('propagates validation errors so the caller transaction rolls back', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([textField]);
      validator.validateMany.mockRejectedValue(new ValidationError('bad value'));

      await expect(
        service.setInitialFieldValues(
          issueId,
          projectId,
          userId,
          [{ fieldId: 'f1', value: 'broken' }],
          tx,
        ),
      ).rejects.toThrow(ValidationError);
      expect(valuesRepo.createMany).not.toHaveBeenCalled();
    });

    it('throws FIELD_NOT_FOUND when a value targets a field outside the project', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([textField]);

      await expect(
        service.setInitialFieldValues(
          issueId,
          projectId,
          userId,
          [{ fieldId: 'unknown-field', value: 'x' }],
          tx,
        ),
      ).rejects.toThrow(NotFoundError);
      expect(valuesRepo.createMany).not.toHaveBeenCalled();
    });
  });

  describe('resolveIssueProject', () => {
    it('returns the issue project id', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      expect(await service.resolveIssueProject(issueId)).toBe(projectId);
    });

    it('throws NotFoundError when issue missing', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(null);
      await expect(service.resolveIssueProject(issueId)).rejects.toThrow(NotFoundError);
    });
  });
});
