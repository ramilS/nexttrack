import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';
import { currentRequestId } from './request-context';

function buildReq(headers: Record<string, string | string[]> = {}): Request {
  return { headers } as unknown as Request;
}

function buildRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

describe('requestIdMiddleware', () => {
  it('honors an incoming x-request-id header', () => {
    const req = buildReq({ [REQUEST_ID_HEADER]: 'upstream-id' });
    const res = buildRes();
    let inContext: string | undefined;
    const next: NextFunction = () => {
      inContext = currentRequestId();
    };

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe('upstream-id');
    expect(res.headers[REQUEST_ID_HEADER]).toBe('upstream-id');
    expect(inContext).toBe('upstream-id');
  });

  it('generates a uuid when no header is present', () => {
    const req = buildReq();
    const res = buildRes();
    requestIdMiddleware(req, res, jest.fn());

    expect(String(req.id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.headers[REQUEST_ID_HEADER]).toBe(req.id);
  });

  it('takes the first value of a multi-value header', () => {
    const req = buildReq({ [REQUEST_ID_HEADER]: ['first', 'second'] });
    const res = buildRes();
    requestIdMiddleware(req, res, jest.fn());

    expect(req.id).toBe('first');
  });
});
