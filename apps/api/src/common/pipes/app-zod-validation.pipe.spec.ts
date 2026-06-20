import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorCode } from '@repo/shared/error-codes';
import { AppZodValidationPipe } from './app-zod-validation.pipe';

class TestDto extends createZodDto(
  z.object({
    name: z.string().min(1),
    count: z.coerce.number().int().min(1).default(1),
  }),
) {}

describe('AppZodValidationPipe', () => {
  const pipe = new AppZodValidationPipe();
  const bodyMeta: ArgumentMetadata = {
    type: 'body',
    metatype: TestDto,
    data: undefined,
  };

  it('parses and transforms valid input through the DTO schema', () => {
    const result = pipe.transform({ name: 'ok', count: '3' }, bodyMeta);

    expect(result).toEqual({ name: 'ok', count: 3 });
  });

  it('throws the legacy-compatible error body on invalid input', () => {
    let thrown: unknown;
    try {
      pipe.transform({ name: '' }, bodyMeta);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const body = (thrown as BadRequestException).getResponse() as {
      code: string;
      message: string;
      detail: Record<string, string[]>;
    };
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.message).toBe('Validation failed');
    expect(body.detail.name).toEqual([expect.any(String)]);
  });

  it('passes non-ZodDto params through untouched', () => {
    const paramMeta: ArgumentMetadata = {
      type: 'param',
      metatype: String,
      data: 'id',
    };

    expect(pipe.transform('raw-value', paramMeta)).toBe('raw-value');
  });
});
