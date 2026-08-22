import { UserKind } from '@prisma/client';
import { userSummaryWithKindSchema } from '@repo/shared/schemas';

/**
 * `packages/shared` (and `apps/web`) deliberately cannot import
 * `@prisma/client`, so `userSummaryWithKindSchema.kind` is a hand-written
 * `z.enum(['HUMAN', 'SERVICE'])` — a string-literal copy of `UserKind` that
 * would keep passing, silently wrong, if the Prisma enum were ever renamed.
 * `apps/api` can see both sides, so this guard belongs here: it fails loudly
 * on that drift instead of leaving it to be discovered by a runtime 500 when
 * a real "kind" value fails `ZodSerializerInterceptor`.
 */
describe('userSummaryWithKindSchema.kind — contract with the Prisma UserKind enum', () => {
  it('accepts exactly the values UserKind currently has, no more, no fewer', () => {
    const schemaValues = new Set(userSummaryWithKindSchema.shape.kind.options);
    const prismaValues = new Set(Object.values(UserKind));

    expect(schemaValues).toEqual(prismaValues);
  });
});
