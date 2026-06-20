import type { Prisma } from '@prisma/client';

/**
 * Opaque transaction handle passed to repository methods so the same
 * operation can run inside an outer transaction. Services receive `Tx`
 * from `TransactionService.run(...)` and forward it to repo calls.
 *
 * This is the only place where Prisma types are referenced for the public
 * repository contract — services should import `Tx` from this module, not
 * from `@prisma/client`.
 */
export type Tx = Prisma.TransactionClient;
