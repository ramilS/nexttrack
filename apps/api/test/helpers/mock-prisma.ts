import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../src/prisma/prisma.service';

export type MockPrismaService = DeepMockProxy<PrismaService>;

export const createMockPrisma = (): MockPrismaService =>
  mockDeep<PrismaService>();
