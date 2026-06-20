import { z } from 'zod';
import { versionSchema, versionStatusSchema } from './version.schema';
import { userSummarySchema } from './common.schema';

export const FIELD_NAME_MAX = 100;
export const FIELD_DESCRIPTION_MAX = 500;
export const FIELD_OPTION_NAME_MAX = 100;
export const FIELD_TEXT_MAX = 10000;
export const FIELD_NUMBER_PRECISION_MAX = 10;
export const FIELD_NUMBER_UNIT_MAX = 20;

export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DATE',
  'DATETIME',
  'ENUM',
  'MULTI_ENUM',
  'USER',
  'MULTI_USER',
  'VERSION',
  'MULTI_VERSION',
  'PERIOD',
  'URL',
] as const;
export const customFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

// ─── Field option shapes ─────────────────────────────────────

export const enumOptionInputSchema = z.object({
  name: z.string().trim().min(1).max(FIELD_OPTION_NAME_MAX),
  color: z.string().optional(),
});

export const fieldOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  ordinal: z.number().int().nonnegative(),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

// ─── Config (discriminated by type) ──────────────────────────

const textConfigSchema = z.object({
  type: z.literal('TEXT'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().min(1).max(FIELD_TEXT_MAX).optional(),
  isMultiline: z.boolean().optional(),
});

const numberConfigSchema = z.object({
  type: z.literal('NUMBER'),
  min: z.number().optional(),
  max: z.number().optional(),
  precision: z.number().int().min(0).max(FIELD_NUMBER_PRECISION_MAX).optional(),
  unit: z.string().max(FIELD_NUMBER_UNIT_MAX).optional(),
});

const dateConfigSchema = z.object({
  type: z.enum(['DATE', 'DATETIME']),
});

const enumConfigSchema = z.object({
  type: z.enum(['ENUM', 'MULTI_ENUM']),
  options: z.array(enumOptionInputSchema).min(1),
  allowOther: z.boolean().optional(),
});

const userConfigSchema = z.object({
  type: z.enum(['USER', 'MULTI_USER']),
  restrictToProjectMembers: z.boolean().default(true),
});

const versionConfigSchema = z.object({
  type: z.enum(['VERSION', 'MULTI_VERSION']),
  showStatuses: z.array(versionStatusSchema).optional(),
});

const periodConfigSchema = z.object({
  type: z.literal('PERIOD'),
});

const urlConfigSchema = z.object({
  type: z.literal('URL'),
  placeholder: z.string().optional(),
});

export const customFieldConfigSchema = z
  .discriminatedUnion('type', [
    textConfigSchema,
    numberConfigSchema,
    dateConfigSchema,
    enumConfigSchema,
    userConfigSchema,
    versionConfigSchema,
    periodConfigSchema,
    urlConfigSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.type === 'NUMBER' && data.min != null && data.max != null && data.min >= data.max) {
      ctx.addIssue({
        code: 'custom',
        message: 'min must be less than max',
        path: ['max'],
      });
    }
  });
export type CustomFieldConfig = z.infer<typeof customFieldConfigSchema>;

// ─── Request schemas ─────────────────────────────────────────

export const createCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(FIELD_NAME_MAX),
  type: customFieldTypeSchema,
  description: z.string().max(FIELD_DESCRIPTION_MAX).optional(),
  isRequired: z.boolean().optional(),
  config: customFieldConfigSchema,
});
export type CreateCustomFieldInput = z.input<typeof createCustomFieldSchema>;
export type CreateCustomFieldParsed = z.infer<typeof createCustomFieldSchema>;

export const updateCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(FIELD_NAME_MAX).optional(),
  description: z.string().max(FIELD_DESCRIPTION_MAX).nullable().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

export const reorderCustomFieldsSchema = z.object({
  ordinals: z
    .array(
      z.object({
        id: z.guid(),
        ordinal: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type ReorderCustomFieldsInput = z.infer<typeof reorderCustomFieldsSchema>;

export const setFieldValueSchema = z.object({
  value: z.unknown(),
});
export type SetFieldValueInput = z.infer<typeof setFieldValueSchema>;

export const addEnumOptionSchema = enumOptionInputSchema;
export type AddEnumOptionInput = z.infer<typeof addEnumOptionSchema>;

export const updateEnumOptionSchema = z.object({
  name: z.string().trim().min(1).max(FIELD_OPTION_NAME_MAX).optional(),
  color: z.string().optional(),
});
export type UpdateEnumOptionInput = z.infer<typeof updateEnumOptionSchema>;

export const reorderEnumOptionsSchema = z.object({
  ordinals: z
    .array(
      z.object({
        id: z.string(),
        ordinal: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type ReorderEnumOptionsInput = z.infer<typeof reorderEnumOptionsSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const customFieldSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string(),
  type: customFieldTypeSchema,
  description: z.string().nullable(),
  isRequired: z.boolean(),
  ordinal: z.number().int().nonnegative(),
  config: z.record(z.string(), z.unknown()),
  valuesCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

// ─── Display value (discriminated by type) ────────────────────

/**
 * Resolved, human-friendly representation of a field value, built server-side
 * from the raw stored value plus any referenced records (users, versions,
 * enum options). Consumers should switch on `type` for full narrowing.
 */
export const displayValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('number'),
    number: z.number(),
    formatted: z.string(),
  }),
  z.object({
    type: z.literal('date'),
    date: z.string(),
    formatted: z.string(),
  }),
  z.object({ type: z.literal('enum'), option: fieldOptionSchema }),
  z.object({
    type: z.literal('multi_enum'),
    options: z.array(fieldOptionSchema),
  }),
  z.object({ type: z.literal('user'), user: userSummarySchema }),
  z.object({ type: z.literal('multi_user'), users: z.array(userSummarySchema) }),
  z.object({ type: z.literal('version'), version: versionSchema }),
  z.object({
    type: z.literal('multi_version'),
    versions: z.array(versionSchema),
  }),
  z.object({
    type: z.literal('period'),
    minutes: z.number().int().nonnegative(),
    formatted: z.string(),
  }),
  z.object({ type: z.literal('url'), url: z.string() }),
]);
export type DisplayValue = z.infer<typeof displayValueSchema>;

export const customFieldValueSchema = z.object({
  fieldId: z.guid(),
  fieldName: z.string(),
  fieldType: customFieldTypeSchema,
  fieldConfig: z.record(z.string(), z.unknown()),
  value: z.unknown(),
  displayValue: displayValueSchema.nullable(),
  isRequired: z.boolean(),
  ordinal: z.number().int().nonnegative(),
});
export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;
