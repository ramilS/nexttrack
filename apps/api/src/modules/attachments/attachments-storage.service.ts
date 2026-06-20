import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

export interface PresignedUrlOptions {
  ttlSeconds?: number;
  /** When set, forces `Content-Disposition: attachment` with this filename. */
  downloadFilename?: string;
}

@Injectable()
export class AttachmentsStorageService implements OnModuleInit {
  private client: S3Client;
  private bucket: string;

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
    } catch (err) {
      Logger.debug(
        `Bucket "${this.bucket}" not found, creating...`,
        (err as Error).message,
      );
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    storagePath: string,
    mimeType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      }),
    );
  }

  async uploadStream(
    stream: Readable,
    storagePath: string,
    mimeType: string,
    size: number,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
        Body: stream,
        ContentType: mimeType,
        ContentLength: size,
      }),
    );
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
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      }),
    );
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
