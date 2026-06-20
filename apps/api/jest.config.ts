import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s', '!**/node_modules/**', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@test/(.*)$': '<rootDir>/../test/$1',
    '^@repo/shared/error-codes$': '<rootDir>/../../../packages/shared/src/enums/error-codes.enum',
    '^@repo/shared/roles$': '<rootDir>/../../../packages/shared/src/enums/roles.enum',
    '^@repo/shared/pagination$': '<rootDir>/../../../packages/shared/src/constants/pagination',
    '^@repo/shared/invite$': '<rootDir>/../../../packages/shared/src/constants/invite',
    '^@repo/shared/schemas$': '<rootDir>/../../../packages/shared/src/schemas/index',
    '^@repo/shared/schemas/(.*)$': '<rootDir>/../../../packages/shared/src/schemas/$1',
    '^@repo/shared$': '<rootDir>/../../../packages/shared/src/index',
  },
};

export default config;
