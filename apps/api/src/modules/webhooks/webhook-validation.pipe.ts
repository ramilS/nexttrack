import {
  Injectable,
  Inject,
  PipeTransform,
  BadRequestException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z, ZodType } from 'zod';
import { ErrorCode } from '@repo/shared/error-codes';
import {
  createWebhookSchema,
  updateWebhookSchema,
} from '@repo/shared/schemas';
import { webhookConfig } from '@/config';
import { validateWebhookUrlSync } from './url-validator';

function safeUrl(allowPrivateUrls: boolean) {
  return z
    .url()
    .refine(
      (value) => {
        try {
          validateWebhookUrlSync(value, allowPrivateUrls);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'URL is invalid or points to a disallowed address' },
    );
}

function createSchemaFor(allowPrivateUrls: boolean) {
  return createWebhookSchema
    .extend({ url: safeUrl(allowPrivateUrls) })
    .refine((data) => data.provider !== 'GENERIC' || !!data.secret, {
      message: 'secret is required for generic webhooks',
      path: ['secret'],
    });
}

function updateSchemaFor(allowPrivateUrls: boolean) {
  return updateWebhookSchema.extend({
    url: safeUrl(allowPrivateUrls).optional(),
  });
}

abstract class WebhookValidationPipe implements PipeTransform {
  protected abstract schema: ZodType;

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        errors: z.flattenError(result.error),
      });
    }
    return result.data;
  }
}

@Injectable()
export class CreateWebhookValidationPipe extends WebhookValidationPipe {
  protected schema: ZodType;

  constructor(
    @Inject(webhookConfig.KEY) cfg: ConfigType<typeof webhookConfig>,
  ) {
    super();
    this.schema = createSchemaFor(cfg.allowPrivateUrls);
  }
}

@Injectable()
export class UpdateWebhookValidationPipe extends WebhookValidationPipe {
  protected schema: ZodType;

  constructor(
    @Inject(webhookConfig.KEY) cfg: ConfigType<typeof webhookConfig>,
  ) {
    super();
    this.schema = updateSchemaFor(cfg.allowPrivateUrls);
  }
}
