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
  let usersRepo: { findPublicRefsByIds: jest.Mock; findNameRefsByIds: jest.Mock };
  let versionsRepo: { findManyByIds: jest.Mock };

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
    usersRepo = { findPublicRefsByIds: jest.fn(), findNameRefsByIds: jest.fn() };
    versionsRepo = { findManyByIds: jest.fn() };
    // Invoke the task synchronously so the test can assert the re-index call.
    background = { run: jest.fn((task: () => unknown) => void task()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldValuesService,
        { provide: CustomFieldsRepository, useValue: fieldsRepo },
        { provide: CustomFieldValuesRepository, useValue: valuesRepo },
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: UsersReader, useValue: usersRepo },
        { provide: VersionsRepository, useValue: versionsRepo },
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

    it('batches display reference lookups across user and version fields', async () => {
      const userField = { ...textField, id: 'user', type: CustomFieldType.USER };
      const multiUserField = {
        ...textField,
        id: 'multi-user',
        type: CustomFieldType.MULTI_USER,
      };
      const versionField = { ...textField, id: 'version', type: CustomFieldType.VERSION };
      const multiVersionField = {
        ...textField,
        id: 'multi-version',
        type: CustomFieldType.MULTI_VERSION,
      };
      fieldsRepo.findManyByProject.mockResolvedValue([
        userField,
        multiUserField,
        versionField,
        multiVersionField,
      ]);
      valuesRepo.findByIssueAndFields.mockResolvedValue([
        { customFieldId: 'user', value: 'user-2' },
        { customFieldId: 'multi-user', value: ['user-1', 'user-2', 'user-1'] },
        { customFieldId: 'version', value: 'version-2' },
        { customFieldId: 'multi-version', value: ['version-1', 'version-2', 'version-1'] },
      ]);
      usersRepo.findPublicRefsByIds.mockResolvedValue([
        { id: 'user-1', name: 'Ada', email: 'ada@example.com', avatarUrl: null },
        { id: 'user-2', name: 'Linus', email: 'linus@example.com', avatarUrl: null },
      ]);
      versionsRepo.findManyByIds.mockResolvedValue([
        {
          id: 'version-1',
          projectId,
          name: '1.0',
          description: null,
          status: 'UNRELEASED',
          releaseDate: null,
          ordinal: 0,
        },
        {
          id: 'version-2',
          projectId,
          name: '2.0',
          description: null,
          status: 'UNRELEASED',
          releaseDate: null,
          ordinal: 1,
        },
      ]);

      const result = await service.getFieldsForIssue(issueId, projectId);

      expect(usersRepo.findPublicRefsByIds).toHaveBeenCalledTimes(1);
      expect(usersRepo.findPublicRefsByIds).toHaveBeenCalledWith(['user-2', 'user-1']);
      expect(versionsRepo.findManyByIds).toHaveBeenCalledTimes(1);
      expect(versionsRepo.findManyByIds).toHaveBeenCalledWith(['version-2', 'version-1']);
      expect(result.map((field) => field.displayValue)).toEqual([
        {
          type: 'user',
          user: { id: 'user-2', name: 'Linus', email: 'linus@example.com', avatarUrl: null },
        },
        {
          type: 'multi_user',
          users: [
            { id: 'user-1', name: 'Ada', email: 'ada@example.com', avatarUrl: null },
            { id: 'user-2', name: 'Linus', email: 'linus@example.com', avatarUrl: null },
          ],
        },
        {
          type: 'version',
          version: expect.objectContaining({ id: 'version-2', name: '2.0' }),
        },
        {
          type: 'multi_version',
          versions: [
            expect.objectContaining({ id: 'version-1', name: '1.0' }),
            expect.objectContaining({ id: 'version-2', name: '2.0' }),
          ],
        },
      ]);
    });

    it('normalizes legacy enum config without persisting it during a read', async () => {
      fieldsRepo.findManyByProject.mockResolvedValue([
        { ...textField, type: CustomFieldType.ENUM, config: { options: ['Legacy'] } },
      ]);

      const result = await service.getFieldsForIssue(issueId, projectId);

      expect(result[0].fieldConfig.options).toEqual([
        expect.objectContaining({ name: 'Legacy', color: null, ordinal: 0 }),
      ]);
      expect(fieldsRepo.updateConfig).not.toHaveBeenCalled();
    });

    it('uses the same normalized legacy enum option id for a read and subsequent validation', async () => {
      const legacyEnumField = {
        ...textField,
        id: 'legacy-enum',
        type: CustomFieldType.ENUM,
        config: { options: ['Legacy'] },
      };
      fieldsRepo.findManyByProject.mockResolvedValue([legacyEnumField]);

      const fields = await service.getFieldsForIssue(issueId, projectId);
      const optionId = (fields[0].fieldConfig.options as Array<{ id: string }>)[0].id;
      fieldsRepo.findOneInProject.mockResolvedValue(legacyEnumField);
      validator.validate.mockImplementation(async (field: CustomField, value: unknown) => {
        expect((field.config.options as Array<{ id: string }>)[0].id).toBe(optionId);
        return value;
      });

      await service.setFieldValue(issueId, legacyEnumField.id, optionId, userId, projectId);

      expect(validator.validate).toHaveBeenCalledWith(
        expect.objectContaining({ id: legacyEnumField.id }),
        optionId,
        projectId,
      );
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

    it('batches activity reference lookups across initial user and version values', async () => {
      const userField = { ...textField, id: 'user', type: CustomFieldType.USER };
      const multiUserField = {
        ...textField,
        id: 'multi-user',
        type: CustomFieldType.MULTI_USER,
      };
      const versionField = { ...textField, id: 'version', type: CustomFieldType.VERSION };
      const multiVersionField = {
        ...textField,
        id: 'multi-version',
        type: CustomFieldType.MULTI_VERSION,
      };
      fieldsRepo.findManyByProject.mockResolvedValue([
        userField,
        multiUserField,
        versionField,
        multiVersionField,
      ]);
      validator.validateMany.mockResolvedValue([
        { field: userField, validatedValue: 'user-2' },
        { field: multiUserField, validatedValue: ['user-1', 'user-2'] },
        { field: versionField, validatedValue: 'version-2' },
        { field: multiVersionField, validatedValue: ['version-1', 'version-2'] },
      ]);
      usersRepo.findPublicRefsByIds.mockResolvedValue([
        { id: 'user-1', name: 'Ada', email: 'ada@example.com', avatarUrl: null },
        { id: 'user-2', name: 'Linus', email: 'linus@example.com', avatarUrl: null },
      ]);
      versionsRepo.findManyByIds.mockResolvedValue([
        {
          id: 'version-1', projectId, name: '1.0', description: null,
          status: 'UNRELEASED', releaseDate: null, ordinal: 0,
        },
        {
          id: 'version-2', projectId, name: '2.0', description: null,
          status: 'UNRELEASED', releaseDate: null, ordinal: 1,
        },
      ]);

      await service.setInitialFieldValues(
        issueId,
        projectId,
        userId,
        [
          { fieldId: userField.id, value: 'user-2' },
          { fieldId: multiUserField.id, value: ['user-1', 'user-2'] },
          { fieldId: versionField.id, value: 'version-2' },
          { fieldId: multiVersionField.id, value: ['version-1', 'version-2'] },
        ],
        tx,
      );

      expect(usersRepo.findPublicRefsByIds).toHaveBeenCalledTimes(1);
      expect(usersRepo.findPublicRefsByIds).toHaveBeenCalledWith(['user-2', 'user-1']);
      expect(versionsRepo.findManyByIds).toHaveBeenCalledTimes(1);
      expect(versionsRepo.findManyByIds).toHaveBeenCalledWith(['version-2', 'version-1']);
      expect(activities.record).toHaveBeenCalledWith(
        issueId,
        userId,
        expect.arrayContaining([
          expect.objectContaining({ payload: expect.objectContaining({ to: 'Linus' }) }),
          expect.objectContaining({ payload: expect.objectContaining({ to: 'Ada, Linus' }) }),
          expect.objectContaining({ payload: expect.objectContaining({ to: '2.0' }) }),
          expect.objectContaining({ payload: expect.objectContaining({ to: '1.0, 2.0' }) }),
        ]),
        tx,
      );
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
