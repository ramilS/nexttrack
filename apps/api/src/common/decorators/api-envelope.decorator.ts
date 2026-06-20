import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ZodSerializerDto, type ZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginationMetaSchema, cursorMetaSchema } from '@repo/shared/schemas';

/**
 * Response decorators that keep the OpenAPI document truthful about the
 * TransformInterceptor envelope:
 *
 * - plain returns are wrapped into `{ data, meta: { timestamp } }`
 * - paginated returns (`{ items, meta }`) pass through unwrapped
 *
 * Each decorator also applies ZodSerializerDto, so the raw handler return is
 * parsed through the response schema BEFORE the envelope is added: unknown
 * fields are stripped (no accidental secret/internal-field leaks) and contract
 * drift fails loudly as a logged 500 instead of silently shipping a lie.
 */

// Note: @nestjs/swagger 11.4 closed deep imports via its exports map, so the
// SchemaObject type is no longer importable — these rely on structural typing.
const TIMESTAMP_META_SCHEMA = {
  type: 'object',
  required: ['timestamp'],
  properties: {
    timestamp: { type: 'string', format: 'date-time' },
  },
};

const PAGINATION_META_SCHEMA = {
  type: 'object',
  required: ['total', 'page', 'perPage', 'totalPages'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    perPage: { type: 'integer', minimum: 1 },
    totalPages: { type: 'integer', minimum: 0 },
  },
};

const CURSOR_META_SCHEMA = {
  type: 'object',
  required: ['nextCursor', 'pageSize', 'hasNextPage'],
  properties: {
    nextCursor: { type: 'string', nullable: true },
    pageSize: { type: 'integer', minimum: 1 },
    hasNextPage: { type: 'boolean' },
  },
};

interface ApiEnvelopeOptions {
  status?: number;
  description?: string;
  /**
   * The handler may return null (e.g. getActiveTimer → ActiveTimer | null).
   * createZodDto can't wrap a top-level-nullable schema, so the serializer is
   * fed `dto.schema.nullable()` directly and the doc marks `data` nullable.
   * Ignored for the array (`[Dto]`) form.
   */
  nullable?: boolean;
}

/**
 * Documents `{ data: Dto, meta: { timestamp } }` (or `data: Dto[]` for the
 * `[Dto]` form) and serializes the raw handler return through the DTO schema.
 */
export function ApiEnvelope(
  dto: ZodDto | [ZodDto],
  options: ApiEnvelopeOptions = {},
) {
  const { status = HttpStatus.OK, description, nullable = false } = options;
  const isArray = Array.isArray(dto);
  const model = isArray ? dto[0] : dto;
  const dataSchema = isArray
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : nullable
      ? { allOf: [{ $ref: getSchemaPath(model) }], nullable: true }
      : { $ref: getSchemaPath(model) };
  const serializer =
    nullable && !isArray ? (model.schema as z.ZodType).nullable() : dto;

  return applyDecorators(
    ZodSerializerDto(serializer),
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: dataSchema,
          meta: TIMESTAMP_META_SCHEMA,
        },
      },
    }),
  );
}

/**
 * Documents `{ items: Dto[], meta: PaginationMeta }` — the shape
 * TransformInterceptor passes through without wrapping — and serializes the
 * full paginated object.
 */
export function ApiPaginated<TItem extends z.ZodType>(
  dto: ZodDto<TItem>,
  options: ApiEnvelopeOptions = {},
) {
  const { status = HttpStatus.OK, description } = options;

  return applyDecorators(
    ZodSerializerDto(
      z.object({
        items: z.array(dto.schema),
        meta: paginationMetaSchema,
      }),
    ),
    ApiExtraModels(dto),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['items', 'meta'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(dto) } },
          meta: PAGINATION_META_SCHEMA,
        },
      },
    }),
  );
}

/**
 * Documents the DTO schema AS-IS as the whole 200 body (no envelope) and
 * serializes the handler return through it. For handlers that already return a
 * top-level `{ items, meta }`-shaped object with a non-pagination meta (e.g.
 * search) — TransformInterceptor passes any object with `items`+`meta` through
 * unwrapped, so the DTO itself is the full response.
 */
export function ApiRaw(dto: ZodDto, options: ApiEnvelopeOptions = {}) {
  const { status = HttpStatus.OK, description } = options;
  return applyDecorators(
    ZodSerializerDto(dto),
    ApiExtraModels(dto),
    ApiResponse({
      status,
      description,
      schema: { $ref: getSchemaPath(dto) },
    }),
  );
}

/**
 * Documents `{ items: Dto[], meta: CursorMeta }` — the keyset-pagination shape
 * TransformInterceptor passes through without wrapping — and serializes the
 * full cursor-paginated object.
 */
export function ApiCursorPaginated<TItem extends z.ZodType>(
  dto: ZodDto<TItem>,
  options: ApiEnvelopeOptions = {},
) {
  const { status = HttpStatus.OK, description } = options;

  return applyDecorators(
    ZodSerializerDto(
      z.object({
        items: z.array(dto.schema),
        meta: cursorMetaSchema,
      }),
    ),
    ApiExtraModels(dto),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['items', 'meta'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(dto) } },
          meta: CURSOR_META_SCHEMA,
        },
      },
    }),
  );
}
