import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { storageConfig } from '@/config';
import { buildAttachmentDisposition } from './content-disposition';
import { AppLogger } from '@/common/logging/app-logger';

export interface PresignedUrlOptions {
  ttlSeconds?: number;
  /** When set, forces `Content-Disposition: attachment` with this filename. */
  downloadFilename?: string;
}

@Injectable()
export class AttachmentsStorageService implements OnModuleInit {
  private client: S3Client;
  private bucket: string;
  private readonly logger = new AppLogger(AttachmentsStorageService.name);

  constructor(
    @Inject(storageConfig.KEY)
    private config: ConfigType<typeof storageConfig>,
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
    this.bucket = config.bucket;
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log('S3 bucket not found, creating', { bucket: this.bucket });
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    storagePath: string,
    mimeType: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
          Body: buffer,
          ContentType: mimeType,
          ContentLength: buffer.length,
        }),
      );
      this.logger.log('S3 object uploaded', {
        key: storagePath,
        size: buffer.length,
        mimeType,
      });
    } catch (err) {
      this.logger.error('S3 upload failed', err, { key: storagePath });
      throw err;
    }
  }

  async uploadStream(
    stream: Readable,
    storagePath: string,
    mimeType: string,
    size: number,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
          Body: stream,
          ContentType: mimeType,
          ContentLength: size,
        }),
      );
      this.logger.log('S3 object uploaded', {
        key: storagePath,
        size,
        mimeType,
      });
    } catch (err) {
      this.logger.error('S3 upload failed', err, { key: storagePath });
      throw err;
    }
  }

  async getPresignedUrl(
    storagePath: string,
    options: PresignedUrlOptions = {},
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storagePath,
      ...(options.downloadFilename
        ? {
            ResponseContentDisposition: buildAttachmentDisposition(
              options.downloadFilename,
            ),
          }
        : {}),
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.ttlSeconds ?? this.config.presignedUrlTtl,
    });
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );
      this.logger.log('S3 object deleted', { key: storagePath });
    } catch (err) {
      this.logger.error('S3 delete failed', err, { key: storagePath });
      throw err;
    }
  }

  async getObject(storagePath: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      }),
    );

    return response.Body as Readable;
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
