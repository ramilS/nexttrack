import { ConfigType } from '@nestjs/config';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageConfig } from '@/config';
import { AttachmentsStorageService } from './attachments-storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockedGetSignedUrl = jest.mocked(getSignedUrl);

describe('AttachmentsStorageService', () => {
  let service: AttachmentsStorageService;

  const config: ConfigType<typeof storageConfig> = {
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKey: 'test-access',
    secretKey: 'test-secret',
    bucket: 'test-bucket',
    forcePathStyle: true,
    presignedUrlTtl: 60,
    maxFileSizeBytes: 50 * 1024 * 1024,
    maxFilesPerUpload: 10,
    maxTotalPerIssue: 100,
    thumbnailMaxWidth: 400,
    thumbnailMaxHeight: 300,
    thumbnailQuality: 80,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSignedUrl.mockResolvedValue('https://s3/presigned');
    service = new AttachmentsStorageService(config);
  });

  const lastCommand = (): GetObjectCommand => {
    const [, command] = mockedGetSignedUrl.mock.calls[0];
    return command as GetObjectCommand;
  };

  describe('getPresignedUrl', () => {
    it('forces attachment disposition with the sanitized filename', async () => {
      const url = await service.getPresignedUrl('attachments/i-1/a-1.pdf', {
        downloadFilename: 'My Report.pdf',
      });

      expect(url).toBe('https://s3/presigned');
      expect(lastCommand().input).toMatchObject({
        Bucket: 'test-bucket',
        Key: 'attachments/i-1/a-1.pdf',
        ResponseContentDisposition:
          'attachment; filename="My Report.pdf"; filename*=UTF-8\'\'My%20Report.pdf',
      });
    });

    it('sanitizes CR/LF and quotes out of the filename', async () => {
      await service.getPresignedUrl('attachments/i-1/a-1.pdf', {
        downloadFilename: 'bad"\r\nname.pdf',
      });

      const disposition = lastCommand().input
        .ResponseContentDisposition as string;
      expect(disposition).not.toContain('\r');
      expect(disposition).not.toContain('\n');
      expect(disposition).toContain('filename="bad_name.pdf"');
    });

    it('omits the disposition when no download filename is given', async () => {
      await service.getPresignedUrl('attachments/i-1/thumb.png');

      expect(lastCommand().input.ResponseContentDisposition).toBeUndefined();
    });

    it('uses the configured TTL by default and an override when given', async () => {
      await service.getPresignedUrl('path');
      expect(mockedGetSignedUrl).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 60 },
      );

      await service.getPresignedUrl('path', { ttlSeconds: 300 });
      expect(mockedGetSignedUrl).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });
  });
});
