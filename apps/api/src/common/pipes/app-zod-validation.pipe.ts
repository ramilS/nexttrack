import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { z, ZodError } from 'zod';
import { ErrorCode } from '@repo/shared/error-codes';

/**
 * Global validation pipe for ZodDto-typed handler params (createZodDto
 * classes). Params whose metatype is not a ZodDto pass through untouched, so
 * @Param('id'), custom decorators and the legacy per-call-site
 * ZodValidationPipe keep working during the migration. Produces the exact
 * same error body as the legacy pipe so the global filter envelope —
 * { error: { code: VALIDATION_ERROR, ... } } — is unchanged.
 */
export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: unknown) =>
    new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      detail: error instanceof ZodError ? z.flattenError(error).fieldErrors : undefined,
    }),
});
