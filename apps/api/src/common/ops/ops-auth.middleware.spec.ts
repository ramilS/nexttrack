import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { OpsAuthMiddleware } from './ops-auth.middleware';
import { mockAppConfig } from '@test/helpers';

function buildReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe('OpsAuthMiddleware', () => {
  const buildMiddleware = (token: string | undefined, nodeEnv: string) =>
    new OpsAuthMiddleware(
      { token },
      { ...mockAppConfig, nodeEnv: nodeEnv as typeof mockAppConfig.nodeEnv },
    );

  const res = {} as Response;

  it('allows access without a token outside production', () => {
    const next: NextFunction = jest.fn();
    buildMiddleware(undefined, 'development').use(buildReq(), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('hides the prefix (404) in production when no token is configured', () => {
    expect(() =>
      buildMiddleware(undefined, 'production').use(buildReq(), res, jest.fn()),
    ).toThrow(NotFoundException);
  });

  it('accepts the correct bearer token', () => {
    const next: NextFunction = jest.fn();
    buildMiddleware('super-secret-ops-token', 'production').use(
      buildReq('Bearer super-secret-ops-token'),
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('rejects a wrong token', () => {
    expect(() =>
      buildMiddleware('super-secret-ops-token', 'production').use(
        buildReq('Bearer wrong-token-wrong-token'),
        res,
        jest.fn(),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing Authorization header when a token is configured', () => {
    expect(() =>
      buildMiddleware('super-secret-ops-token', 'development').use(
        buildReq(),
        res,
        jest.fn(),
      ),
    ).toThrow(UnauthorizedException);
  });
});
