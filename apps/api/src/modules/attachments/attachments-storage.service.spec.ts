import { AddressInfo, createServer, Server, Socket } from 'net';
import { ConfigType } from '@nestjs/config';
import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { ErrorCode } from '@repo/shared';
import { storageConfig } from '@/config';
import { NotFoundError } from '@/common/errors/domain.errors';
import { AttachmentsStorageService } from './attachments-storage.service';

describe('AttachmentsStorageService', () => {
  let service: AttachmentsStorageService;
  let send: jest.SpyInstance;

  const config: ConfigType<typeof storageConfig> = {
    endpoint: 'http://localhost:3900',
    region: 'garage',
    accessKey: 'test-access',
    secretKey: 'test-secret',
    bucket: 'test-bucket',
    forcePathStyle: true,
    connectionTimeoutMs: 5_000,
    socketTimeoutMs: 30_000,
    cacheMaxAgeSeconds: 60,
    maxFileSizeBytes: 50 * 1024 * 1024,
    maxFilesPerUpload: 10,
    maxTotalPerIssue: 100,
    thumbnailMaxWidth: 400,
    thumbnailMaxHeight: 300,
    thumbnailQuality: 80,
  };

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send');
    service = new AttachmentsStorageService(config);
  });

  afterEach(() => {
    send.mockRestore();
  });

  describe('getObject', () => {
    it('returns the object stream with its stored type and length', async () => {
      const body = Readable.from([Buffer.from('bytes')]);
      send.mockResolvedValue({ Body: body, ContentType: 'image/png', ContentLength: 5 });

      const object = await service.getObject('attachments/i-1/a-1.png');

      expect(object).toEqual({ body, contentType: 'image/png', contentLength: 5 });
      const [command] = send.mock.calls[0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({ Bucket: 'test-bucket', Key: 'attachments/i-1/a-1.png' });
    });

    it('falls back to a non-renderable type when the bucket stored none', async () => {
      send.mockResolvedValue({ Body: Readable.from([]) });

      const object = await service.getObject('attachments/i-1/a-1');

      expect(object.contentType).toBe('application/octet-stream');
    });

    it('turns a missing key into an attachment 404, not a 500', async () => {
      send.mockRejectedValue(new NoSuchKey({ message: 'gone', $metadata: {} }));

      const result = service.getObject('attachments/i-1/a-1.png');

      await expect(result).rejects.toBeInstanceOf(NotFoundError);
      await expect(result).rejects.toMatchObject({ code: ErrorCode.ATTACHMENT_NOT_FOUND });
    });

    it('rethrows any other storage failure unchanged', async () => {
      const outage = new Error('connect ECONNREFUSED');
      send.mockRejectedValue(outage);

      await expect(service.getObject('attachments/i-1/a-1.png')).rejects.toBe(outage);
    });
  });

  describe('against an object store that accepts and then stalls', () => {
    let blackHole: Server;
    const sockets: Socket[] = [];

    beforeEach(async () => {
      send.mockRestore();
      blackHole = createServer((socket) => sockets.push(socket));
      await new Promise<void>((resolve) => blackHole.listen(0, '127.0.0.1', resolve));
    });

    afterEach(async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => blackHole.close(resolve));
    });

    it('gives up after the configured idle time instead of hanging the download', async () => {
      const { port } = blackHole.address() as AddressInfo;
      const stalled = new AttachmentsStorageService({
        ...config,
        endpoint: `http://127.0.0.1:${port}`,
        socketTimeoutMs: 200,
      });

      await expect(stalled.getObject('attachments/i-1/a-1.png')).rejects.toMatchObject({
        name: 'TimeoutError',
      });
    }, 10_000);
  });
});
