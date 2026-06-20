import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundError,
  ValidationError,
  PermissionDeniedError,
} from '@/common/errors/domain.errors';
import { AttachmentsService } from './attachments.service';
import { AttachmentsRepository, type RawAttachment } from './attachments.repository';
import { AttachmentsStorageService } from './attachments-storage.service';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { storageConfig } from '@/config';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let attachmentsRepo: jest.Mocked<AttachmentsRepository>;
  let issuesRepo: jest.Mocked<IssuesReader>;
  let projectMembersRepo: jest.Mocked<ProjectMembersRepository>;
  let storage: {
    uploadBuffer: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };
  let activitiesService: { recordOne: jest.Mock };

  const mockConfig = {
    maxFileSizeBytes: 50 * 1024 * 1024,
    maxFilesPerUpload: 10,
    maxTotalPerIssue: 100,
  };

  const baseRaw: RawAttachment = {
    id: 'att-1',
    issueId: 'issue-1',
    uploadedById: 'user-1',
    uploadedBy: { id: 'user-1', name: 'Test', email: 't@t.local', avatarUrl: null },
    filename: 'test.png',
    mimeType: 'image/png',
    size: 1024,
    storagePath: 'attachments/issue-1/att-1.png',
    thumbnailPath: null,
    createdAt: '2026-05-13T00:00:00.000Z',
  };

  beforeEach(async () => {
    storage = {
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
      getPresignedUrl: jest.fn().mockResolvedValue('https://s3/presigned'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    activitiesService = { recordOne: jest.fn().mockResolvedValue(undefined) };

    const attachmentsRepoMock: jest.Mocked<AttachmentsRepository> = {
      countActiveByIssue: jest.fn(),
      findActiveByIssue: jest.fn(),
      findActiveById: jest.fn(),
      findIssueProjectId: jest.fn(),
      create: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<AttachmentsRepository>;

    const issuesRepoMock: jest.Mocked<IssuesReader> = {
      findProjectIdById: jest.fn(),
      findIssueRef: jest.fn(),
    } as unknown as jest.Mocked<IssuesReader>;

    const projectMembersRepoMock: jest.Mocked<ProjectMembersRepository> = {
      isMember: jest.fn(),
    } as unknown as jest.Mocked<ProjectMembersRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: AttachmentsRepository, useValue: attachmentsRepoMock },
        { provide: IssuesReader, useValue: issuesRepoMock },
        { provide: ProjectMembersRepository, useValue: projectMembersRepoMock },
        { provide: AttachmentsStorageService, useValue: storage },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: storageConfig.KEY, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(AttachmentsService);
    attachmentsRepo = module.get(AttachmentsRepository);
    issuesRepo = module.get(IssuesReader);
    projectMembersRepo = module.get(ProjectMembersRepository);
  });

  describe('upload', () => {
    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('fake'),
    };

    it('should upload file and create attachment record', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue('proj-1');
      attachmentsRepo.countActiveByIssue.mockResolvedValue(0);
      attachmentsRepo.create.mockResolvedValue(baseRaw);

      const result = await service.upload('issue-1', [file], 'user-1');

      expect(result).toHaveLength(1);
      expect(storage.uploadBuffer).toHaveBeenCalled();
      expect(attachmentsRepo.create).toHaveBeenCalled();
      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'ATTACHMENT_ADD', expect.any(Object),
      );
    });

    it('should throw NotFoundError for missing issue', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(null);

      await expect(service.upload('missing', [file], 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when limit exceeded', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue('proj-1');
      attachmentsRepo.countActiveByIssue.mockResolvedValue(100);

      await expect(service.upload('issue-1', [file], 'user-1')).rejects.toThrow(ValidationError);
    });

    it('should reject blocked extensions', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue('proj-1');
      attachmentsRepo.countActiveByIssue.mockResolvedValue(0);

      const exeFile = { ...file, originalname: 'virus.exe' };

      await expect(service.upload('issue-1', [exeFile], 'user-1')).rejects.toThrow(ValidationError);
    });

    it('should reject disallowed MIME types', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue('proj-1');
      attachmentsRepo.countActiveByIssue.mockResolvedValue(0);

      const badFile = { ...file, mimetype: 'application/x-executable' };

      await expect(service.upload('issue-1', [badFile], 'user-1')).rejects.toThrow(ValidationError);
    });

    it('should reject oversized files', async () => {
      issuesRepo.findProjectIdById.mockResolvedValue('proj-1');
      attachmentsRepo.countActiveByIssue.mockResolvedValue(0);

      const bigFile = { ...file, size: 100 * 1024 * 1024 };

      await expect(service.upload('issue-1', [bigFile], 'user-1')).rejects.toThrow(ValidationError);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return presigned URL for project member', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(baseRaw);
      attachmentsRepo.findIssueProjectId.mockResolvedValue('proj-1');
      projectMembersRepo.isMember.mockResolvedValue(true);

      const result = await service.getDownloadUrl('att-1', 'user-1');

      expect(result).toBe('https://s3/presigned');
      expect(storage.getPresignedUrl).toHaveBeenCalledWith(
        'attachments/issue-1/att-1.png',
        { downloadFilename: 'test.png' },
      );
    });

    it('should throw PermissionDeniedError for non-member', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(baseRaw);
      attachmentsRepo.findIssueProjectId.mockResolvedValue('proj-1');
      projectMembersRepo.isMember.mockResolvedValue(false);

      await expect(service.getDownloadUrl('att-1', 'non-member')).rejects.toThrow(PermissionDeniedError);
    });

    it('should throw NotFoundError for missing attachment', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(null);

      await expect(service.getDownloadUrl('missing', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('softDelete', () => {
    it('should soft-delete by uploader', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(baseRaw);

      await service.softDelete('att-1', 'user-1', false);

      expect(attachmentsRepo.softDelete).toHaveBeenCalledWith('att-1', 'user-1');
      expect(storage.deleteFile).toHaveBeenCalledWith('attachments/issue-1/att-1.png');
    });

    it('should allow admin to delete any attachment', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(baseRaw);

      await service.softDelete('att-1', 'other-user', true);

      expect(attachmentsRepo.softDelete).toHaveBeenCalled();
    });

    it('should throw PermissionDeniedError for non-uploader non-admin', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(baseRaw);

      await expect(service.softDelete('att-1', 'other-user', false)).rejects.toThrow(PermissionDeniedError);
      expect(attachmentsRepo.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError for missing attachment', async () => {
      attachmentsRepo.findActiveById.mockResolvedValue(null);

      await expect(service.softDelete('missing', 'user-1', false)).rejects.toThrow(NotFoundError);
    });
  });
});
