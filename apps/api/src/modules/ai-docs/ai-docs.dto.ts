import { createZodDto } from 'nestjs-zod';
import { updateAiDocsSettingsSchema } from '@repo/shared/schemas';

export class UpdateAiDocsSettingsDto extends createZodDto(
  updateAiDocsSettingsSchema,
) {}
