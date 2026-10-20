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
  NoSuchKey,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { ErrorCode } from '@repo/shared';
import { storageConfig } from '@/config';
import { NotFoundError } from '@/common/errors/domain.errors';
import { AppLogger } from '@/common/logging/app-logger';

export interface StoredObject {
  body: Readable;
  contentType: string;
  contentLength?: number;
}

const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

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
      requestHandler: {
        connectionTimeout: config.connectionTimeoutMs,
        socketTimeout: config.socketTimeoutMs,
      },
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

  async getObject(storagePath: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: storagePath }),
      );
      if (!(response.Body instanceof Readable)) {
        throw new Error('S3 GetObject returned a non-stream body');
      }
      return {
        body: response.Body,
        contentType: response.ContentType ?? FALLBACK_CONTENT_TYPE,
        contentLength: response.ContentLength,
      };
    } catch (err) {
      if (err instanceof NoSuchKey) {
        this.logger.warn('S3 object missing for an active attachment', {
          key: storagePath,
        });
        throw new NotFoundError(ErrorCode.ATTACHMENT_NOT_FOUND);
      }
      this.logger.error('S3 get failed', err, { key: storagePath });
      throw err;
    }
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
