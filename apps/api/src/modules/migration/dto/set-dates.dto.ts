import { z } from 'zod';

export const setDatesSchema = z.object({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable().optional(),
});

export type SetDatesDto = z.infer<typeof setDatesSchema>;
