import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IssueTagsController } from './issue-tags.controller';
import { TagsService } from './tags.service';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

describe('IssueTagsController', () => {
  let controller: IssueTagsController;
  let tagsService: {
    addTagToIssue: jest.Mock;
    removeTagFromIssue: jest.Mock;
  };

  const issueId = 'issue-1';
  const tagId = 'tag-1';
  const userId = 'user-1';

  beforeEach(async () => {
    const mockService = {
      addTagToIssue: jest.fn(),
      removeTagFromIssue: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [IssueTagsController],
      providers: [
        { provide: TagsService, useValue: mockService },
        { provide: IssuesReader, useValue: {} },
        { provide: ProjectsRepository, useValue: {} },
        { provide: ProjectMembersRepository, useValue: {} },
        { provide: PermissionsCacheService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get(IssueTagsController);
    tagsService = module.get<typeof tagsService>(TagsService);
  });

  describe('POST /issues/:issueId/tags', () => {
    it('should delegate to tagsService.addTagToIssue', async () => {
      const link = { issueId, tagId };
      tagsService.addTagToIssue.mockResolvedValue(link);

      const result = await controller.addTag(issueId, { tagId }, userId);

      expect(tagsService.addTagToIssue).toHaveBeenCalledWith(issueId, tagId, userId);
      expect(result).toEqual(link);
    });

    it('should propagate NotFoundException from service', async () => {
      tagsService.addTagToIssue.mockRejectedValue(new NotFoundException());

      await expect(controller.addTag(issueId, { tagId }, userId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /issues/:issueId/tags/:tagId', () => {
    it('should delegate to tagsService.removeTagFromIssue', async () => {
      tagsService.removeTagFromIssue.mockResolvedValue(undefined);

      await controller.removeTag(issueId, tagId, userId);

      expect(tagsService.removeTagFromIssue).toHaveBeenCalledWith(issueId, tagId, userId);
    });

    it('should propagate NotFoundException from service', async () => {
      tagsService.removeTagFromIssue.mockRejectedValue(new NotFoundException());

      await expect(controller.removeTag(issueId, tagId, userId))
        .rejects.toThrow(NotFoundException);
    });
  });
});
