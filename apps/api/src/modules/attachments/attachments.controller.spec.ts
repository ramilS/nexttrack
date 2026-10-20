import { createServer, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { storageConfig } from '@/config';
import { RequestUser } from '@/common/decorators/current-user.decorator';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import { ApiKeyAuthService } from '@/modules/api-keys/api-key-auth.service';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService, type AttachmentContent } from './attachments.service';

describe('AttachmentsController', () => {
  const user: RequestUser = {
    id: 'user-1',
    email: 'u@test.local',
    name: 'User',
    role: GlobalRole.USER,
    avatarUrl: null,
  };
  const fileBytes = Buffer.from('%PDF-1.7 report body');

  let controller: AttachmentsController;
  let server: Server | undefined;
  let attachmentsService: { openDownload: jest.Mock; openThumbnail: jest.Mock };

  beforeEach(async () => {
    attachmentsService = {
      openDownload: jest.fn(),
      openThumbnail: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [
        { provide: AttachmentsService, useValue: attachmentsService },
        { provide: storageConfig.KEY, useValue: { cacheMaxAgeSeconds: 120 } },
        // Dependencies of the @IssueAuth() guards, which these tests bypass by
        // calling the handlers directly.
        { provide: IssuesReader, useValue: {} },
        { provide: ProjectsRepository, useValue: {} },
        { provide: ProjectMembersRepository, useValue: {} },
        { provide: PermissionsCacheService, useValue: {} },
        { provide: ApiKeyAuthService, useValue: {} },
        Reflector,
      ],
    }).compile();
    controller = moduleRef.get(AttachmentsController);
  });

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  /** Serves one handler over real HTTP, so headers and bytes are what a browser gets. */
  async function serve(handler: (res: ServerResponse) => Promise<void>) {
    const handled: Promise<void>[] = [];
    const listening = createServer((_req, res) => {
      handled.push(handler(res));
    });
    server = listening;
    await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
    const { port } = listening.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}/`, handled };
  }

  const content = (overrides: Partial<AttachmentContent> = {}): AttachmentContent => ({
    body: Readable.from([fileBytes]),
    contentType: 'application/pdf',
    contentLength: fileBytes.length,
    ...overrides,
  });

  it('streams a download from the API origin, forced to save under its original name', async () => {
    attachmentsService.openDownload.mockResolvedValue(
      content({ downloadFilename: 'Q3 report.pdf' }),
    );
    const { url } = await serve((res) =>
      controller.download('issue-1', 'att-1', { inline: false }, user, res),
    );

    const res = await fetch(url, { redirect: 'manual' });

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(fileBytes);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-length')).toBe(String(fileBytes.length));
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="Q3 report.pdf"; filename*=UTF-8\'\'Q3%20report.pdf',
    );
    expect(res.headers.get('cache-control')).toBe('private, max-age=120');
    expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
    expect(res.headers.get('location')).toBeNull();
    expect(attachmentsService.openDownload).toHaveBeenCalledWith('issue-1', 'att-1', 'user-1', false);
  });

  it('serves a thumbnail inline, without a download disposition', async () => {
    attachmentsService.openThumbnail.mockResolvedValue(
      content({ contentType: 'image/webp' }),
    );
    const { url } = await serve((res) => controller.thumbnail('issue-1', 'att-1', user, res));

    const res = await fetch(url);

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(fileBytes);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('content-disposition')).toBeNull();
    expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
  });

  it('settles the handler when the object store drops the stream mid-transfer', async () => {
    const failing = new Readable({
      read() {
        this.push(fileBytes.subarray(0, 4));
        this.destroy(new Error('socket hang up'));
      },
    });
    attachmentsService.openDownload.mockResolvedValue(
      content({ body: failing, downloadFilename: 'r.pdf' }),
    );
    const { url, handled } = await serve((res) =>
      controller.download('issue-1', 'att-1', { inline: false }, user, res),
    );

    await expect(fetch(url).then((res) => res.arrayBuffer())).rejects.toThrow();
    await expect(Promise.all(handled)).resolves.toEqual([undefined]);
  });
});
