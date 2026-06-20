import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError, ConflictError } from '@/common/errors/domain.errors';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseRepository } from './knowledge-base.repository';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let repo: Record<string, jest.Mock>;

  const projectId = 'project-1';
  const userId = 'user-1';

  const mockArticle = {
    id: 'art-1',
    projectId,
    parentId: null,
    title: 'Getting Started',
    content: { type: 'doc' },
    slug: 'getting-started',
    sortOrder: 0,
    publishedAt: null,
    archivedAt: null,
    createdBy: { id: userId, name: 'Test', email: 'test@test.local', avatarUrl: null },
    updatedBy: null,
    commentsCount: 0,
    childrenCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    repo = {
      findPage: jest.fn(),
      findTreeRows: jest.fn().mockResolvedValue([]),
      findBySlug: jest.fn().mockResolvedValue(null),
      existsInProject: jest.fn().mockResolvedValue(false),
      findStatusInProject: jest.fn().mockResolvedValue(null),
      findAncestorChain: jest.fn().mockResolvedValue([]),
      isSlugFree: jest.fn().mockResolvedValue(true),
      findSlugsStartingWith: jest.fn().mockResolvedValue([]),
      maxSiblingOrdinal: jest.fn().mockResolvedValue(-1),
      create: jest.fn(),
      update: jest.fn(),
      move: jest.fn(),
      setPublishedAt: jest.fn(),
      setArchivedAt: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      findCommentsPage: jest.fn(),
      createComment: jest.fn(),
      findCommentRecord: jest.fn().mockResolvedValue(null),
      updateComment: jest.fn(),
      deleteComment: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: KnowledgeBaseRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  describe('findBySlug', () => {
    it('should return article by slug', async () => {
      repo.findBySlug.mockResolvedValue(mockArticle);
      const result = await service.findBySlug(projectId, 'getting-started');
      expect(result.slug).toBe('getting-started');
    });

    it('should throw when not found', async () => {
      repo.findBySlug.mockResolvedValue(null);
      await expect(service.findBySlug(projectId, 'bad')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('should create an article with auto-generated slug', async () => {
      repo.findSlugsStartingWith.mockResolvedValue([]);
      repo.maxSiblingOrdinal.mockResolvedValue(-1);
      repo.create.mockResolvedValue(mockArticle);

      const result = await service.create(projectId, {
        title: 'Getting Started',
        content: { type: 'doc' },
      }, userId);

      expect(result.title).toBe('Getting Started');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, slug: 'getting-started' }),
      );
    });

    it('should reject duplicate slug', async () => {
      repo.isSlugFree.mockResolvedValue(false);

      await expect(
        service.create(projectId, { title: 'Test', slug: 'getting-started', content: { type: 'doc' } }, userId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    it('should update article', async () => {
      repo.existsInProject.mockResolvedValue(true);
      repo.isSlugFree.mockResolvedValue(true);
      repo.update.mockResolvedValue({ ...mockArticle, title: 'Updated' });

      const result = await service.update(projectId, 'art-1', {
        title: 'Updated',
        slug: 'updated',
      }, userId);

      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete article', async () => {
      repo.existsInProject.mockResolvedValue(true);

      await service.remove(projectId, 'art-1');
      expect(repo.delete).toHaveBeenCalledWith('art-1');
    });
  });

  describe('publish', () => {
    it('should publish an unpublished article', async () => {
      repo.findStatusInProject.mockResolvedValue({ publishedAt: null, archivedAt: null });
      repo.setPublishedAt.mockResolvedValue({ ...mockArticle, publishedAt: new Date().toISOString() });

      const result = await service.publish(projectId, 'art-1');
      expect(result.publishedAt).toBeTruthy();
    });

    it('should reject already published article', async () => {
      repo.findStatusInProject.mockResolvedValue({ publishedAt: new Date(), archivedAt: null });

      await expect(service.publish(projectId, 'art-1')).rejects.toThrow(ConflictError);
    });
  });

  describe('archive', () => {
    it('should archive an article', async () => {
      repo.findStatusInProject.mockResolvedValue({ publishedAt: null, archivedAt: null });
      repo.setArchivedAt.mockResolvedValue({ ...mockArticle, archivedAt: new Date().toISOString() });

      const result = await service.archive(projectId, 'art-1');
      expect(result.archivedAt).toBeTruthy();
    });
  });

  describe('getTree', () => {
    it('should build nested tree', async () => {
      repo.findTreeRows.mockResolvedValue([
        { id: 'a1', parentId: null, title: 'Root', slug: 'root', sortOrder: 0, publishedAt: null },
        { id: 'a2', parentId: 'a1', title: 'Child', slug: 'child', sortOrder: 0, publishedAt: null },
      ]);

      const result = await service.getTree(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].title).toBe('Child');
    });
  });

  describe('comments', () => {
    it('should add a comment', async () => {
      const comment = {
        id: 'c1',
        articleId: 'art-1',
        body: { type: 'doc' },
        author: { id: userId, name: 'Test', email: 'test@test.local', avatarUrl: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      repo.createComment.mockResolvedValue(comment);

      const result = await service.addComment(
        'art-1',
        { body: { type: 'doc' } },
        userId,
      );
      expect(result.id).toBe('c1');
    });

    it('should delete a comment', async () => {
      repo.findCommentRecord.mockResolvedValue({ id: 'c1', articleId: 'art-1', authorId: userId });

      await service.deleteComment('c1', userId);
      expect(repo.deleteComment).toHaveBeenCalledWith('c1');
    });

    it('should throw when comment not found', async () => {
      repo.findCommentRecord.mockResolvedValue(null);
      await expect(service.deleteComment('bad', userId)).rejects.toThrow(NotFoundError);
    });
  });
});
