import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpArgumentsHost } from '@nestjs/common/interfaces';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AllExceptionsFilter } from '@/common/filters/http-exception.filter';
import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  UnauthenticatedError,
  ValidationError,
} from '@/common/errors/domain.errors';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    statusCode: number;
    requestId?: string;
  };
}

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

interface MockHost {
  host: ArgumentsHost;
  response: MockResponse;
}

const REQUEST_METHOD = 'POST';
const REQUEST_URL = '/projects/ABC/issues';

function createMockHost(
  request: Partial<Request> = {},
): MockHost {
  const response: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const req: Partial<Request> = {
    method: REQUEST_METHOD,
    url: REQUEST_URL,
    ...request,
  };

  const httpContext: HttpArgumentsHost = {
    getResponse: <T = Response>() => response as unknown as T,
    getRequest: <T = Request>() => req as unknown as T,
    getNext: <T>() => undefined as unknown as T,
  };

  const host: ArgumentsHost = {
    switchToHttp: () => httpContext,
    getArgs: <T extends unknown[] = unknown[]>() => [] as unknown as T,
    getArgByIndex: <T = unknown>() => undefined as unknown as T,
    switchToRpc: () => {
      throw new Error('not implemented in http test host');
    },
    switchToWs: () => {
      throw new Error('not implemented in http test host');
    },
    getType: <TContext extends string = string>() => 'http' as TContext,
  };

  return { host, response };
}

function getJsonBody(response: MockResponse): ErrorBody {
  return response.json.mock.calls[0][0] as ErrorBody;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HttpException with structured { code, message } body', () => {
    it('passes through the status and structured error body', () => {
      const { host, response } = createMockHost();
      const exception = new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Title is required',
      });

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(getJsonBody(response)).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Title is required',
          statusCode: HttpStatus.BAD_REQUEST,
        },
      });
    });

    it('prefers detail over message for the error message when present', () => {
      const { host, response } = createMockHost();
      const exception = new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Generic message',
        detail: 'Specific detail about the field',
      });

      filter.catch(exception, host);

      const body = getJsonBody(response);
      expect(body.error.message).toBe('Specific detail about the field');
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('logs a warning (not an error) for 4xx statuses, including the code', () => {
      const { host } = createMockHost();
      const exception = new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No access',
      });

      filter.catch(exception, host);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      const warnArg = warnSpy.mock.calls[0][0] as string;
      expect(warnArg).toContain('FORBIDDEN');
      expect(warnArg).toContain(REQUEST_METHOD);
      expect(warnArg).toContain(REQUEST_URL);
      expect(warnArg).toContain(String(HttpStatus.FORBIDDEN));
    });
  });

  describe('error-code fallback chain', () => {
    it('falls back to message as code when code is absent', () => {
      const { host, response } = createMockHost();
      const exception = new BadRequestException({
        message: 'Just a message, no code',
      });

      filter.catch(exception, host);

      expect(getJsonBody(response).error.code).toBe('Just a message, no code');
    });

    it("falls back to 'UNKNOWN_ERROR' code when neither code nor message present", () => {
      const { host, response } = createMockHost();
      const exception = new HttpException({}, HttpStatus.CONFLICT);

      filter.catch(exception, host);

      const body = getJsonBody(response);
      expect(body.error.code).toBe('UNKNOWN_ERROR');
      expect(body.error.message).toBe('An error occurred');
      expect(body.error.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it("falls back to 'An error occurred' message when none provided", () => {
      const { host, response } = createMockHost();
      const exception = new HttpException(
        { code: 'SOME_CODE' },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      expect(getJsonBody(response).error.message).toBe('An error occurred');
    });
  });

  describe('HttpException with a string response body', () => {
    it("wraps the string as message with 'UNKNOWN_ERROR' code", () => {
      const { host, response } = createMockHost();
      const exception = new HttpException(
        'Plain string error',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(getJsonBody(response)).toEqual({
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Plain string error',
          statusCode: HttpStatus.BAD_REQUEST,
        },
      });
    });
  });

  describe('HttpException with 5xx status', () => {
    it('logs at error level with the stack for 5xx HttpExceptions', () => {
      const { host } = createMockHost();
      const exception = new InternalServerErrorException({
        code: 'INTERNAL',
        message: 'boom',
      });

      filter.catch(exception, host);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      const [logMessage, logStack] = errorSpy.mock.calls[0];
      expect(logMessage).toContain(String(HttpStatus.INTERNAL_SERVER_ERROR));
      expect(logStack).toBe(exception.stack);
    });
  });

  describe('non-HTTP exceptions (security-critical)', () => {
    it('returns a generic 500 with NO internal message leaked in the body', () => {
      const { host, response } = createMockHost();
      const exception = new Error('secret internal detail');

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      const body = getJsonBody(response);
      expect(body).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        },
      });
      expect(JSON.stringify(body)).not.toContain('secret internal detail');
    });

    it('does NOT leak the stack trace in the response body', () => {
      const { host, response } = createMockHost();
      const exception = new Error('boom');
      exception.stack = 'Error: boom\n    at secretFunction (/srv/app/secret.ts:42:1)';

      filter.catch(exception, host);

      const serialized = JSON.stringify(getJsonBody(response));
      expect(serialized).not.toContain('secretFunction');
      expect(serialized).not.toContain('/srv/app/secret.ts');
    });

    it('logs the full error message and stack server-side', () => {
      const { host } = createMockHost();
      const exception = new Error('secret internal detail');

      filter.catch(exception, host);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [logMessage, logStack] = errorSpy.mock.calls[0];
      expect(logMessage).toContain('secret internal detail');
      expect(logMessage).toContain(REQUEST_METHOD);
      expect(logMessage).toContain(REQUEST_URL);
      expect(logStack).toBe(exception.stack);
    });

    it('handles non-Error thrown values (e.g. a thrown string) without leaking', () => {
      const { host, response } = createMockHost();

      filter.catch('a raw string thrown as error', host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response)).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        },
      });
      const [logMessage, logStack] = errorSpy.mock.calls[0];
      expect(logMessage).toContain('Unknown error');
      expect(logStack).toBeUndefined();
    });
  });

  describe('DomainError mapping', () => {
    it.each([
      [new ValidationError('INVALID_STATUS', 'Bad status'), HttpStatus.BAD_REQUEST],
      [new UnauthenticatedError('TOKEN_EXPIRED', 'Expired'), HttpStatus.UNAUTHORIZED],
      [new PermissionDeniedError('NOT_PROJECT_MEMBER', 'No access'), HttpStatus.FORBIDDEN],
      [new NotFoundError('ISSUE_NOT_FOUND', 'Missing'), HttpStatus.NOT_FOUND],
      [new ConflictError('PROJECT_KEY_TAKEN', 'Taken'), HttpStatus.CONFLICT],
    ] as const)('maps %s to its HTTP status', (exception, status) => {
      const { host, response } = createMockHost();

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(status);
      const body = getJsonBody(response);
      expect(body.error.code).toBe(exception.code);
      expect(body.error.message).toBe(exception.message);
      expect(body.error.statusCode).toBe(status);
    });

    it('includes structured details in the envelope when present', () => {
      const { host, response } = createMockHost();
      const exception = new ValidationError('FIELD_REQUIRED', 'Missing fields', {
        missingFields: [{ id: 'f1' }],
      });

      filter.catch(exception, host);

      const body = getJsonBody(response) as ErrorBody & {
        error: { details?: unknown };
      };
      expect(body.error.details).toEqual({ missingFields: [{ id: 'f1' }] });
    });

    it('omits the details key when not provided', () => {
      const { host, response } = createMockHost();

      filter.catch(new NotFoundError('ISSUE_NOT_FOUND'), host);

      expect(getJsonBody(response).error).not.toHaveProperty('details');
    });

    it('logs 4xx domain errors at warn level with the code and requestId', () => {
      const { host } = createMockHost({ id: 'req-42' });

      filter.catch(new PermissionDeniedError('NOT_PROJECT_MEMBER'), host);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      const warnArg = warnSpy.mock.calls[0][0] as string;
      expect(warnArg).toContain('NOT_PROJECT_MEMBER');
      expect(warnArg).toContain('req-42');
    });

    it('includes requestId in domain error responses', () => {
      const { host, response } = createMockHost({ id: 'req-43' });

      filter.catch(new ConflictError('PROJECT_KEY_TAKEN'), host);

      expect(getJsonBody(response).error.requestId).toBe('req-43');
    });
  });

  describe('Prisma known request errors', () => {
    function buildPrismaError(code: string, message = 'prisma failure') {
      return new Prisma.PrismaClientKnownRequestError(message, {
        code,
        clientVersion: '7.5.0',
      });
    }

    it('maps P2002 (unique constraint) to 409 CONFLICT', () => {
      const { host, response } = createMockHost();

      filter.catch(buildPrismaError('P2002'), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      const body = getJsonBody(response);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('maps P2025 (record not found) to 404 NOT_FOUND', () => {
      const { host, response } = createMockHost();

      filter.catch(buildPrismaError('P2025'), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const body = getJsonBody(response);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps other P-codes to 500 DATABASE_ERROR and logs at error level', () => {
      const { host, response } = createMockHost();

      filter.catch(buildPrismaError('P2003'), host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      const body = getJsonBody(response);
      expect(body.error.code).toBe('DATABASE_ERROR');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logMessage = errorSpy.mock.calls[0][0] as string;
      expect(logMessage).toContain('P2003');
    });

    it('does not leak the raw Prisma message in the response body', () => {
      const { host, response } = createMockHost();

      filter.catch(
        buildPrismaError('P2002', 'Unique constraint failed on User.email'),
        host,
      );

      const serialized = JSON.stringify(getJsonBody(response));
      expect(serialized).not.toContain('User.email');
    });
  });

  describe('requestId propagation', () => {
    const REQUEST_ID = 'req-test-id-123';

    it('includes requestId in HttpException responses when req.id is set', () => {
      const { host, response } = createMockHost({ id: REQUEST_ID });
      const exception = new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'bad input',
      });

      filter.catch(exception, host);

      expect(getJsonBody(response).error.requestId).toBe(REQUEST_ID);
    });

    it('includes requestId in Prisma error responses', () => {
      const { host, response } = createMockHost({ id: REQUEST_ID });
      const exception = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7.5.0',
      });

      filter.catch(exception, host);

      expect(getJsonBody(response).error.requestId).toBe(REQUEST_ID);
    });

    it('includes requestId in generic 500 responses and server-side logs', () => {
      const { host, response } = createMockHost({ id: REQUEST_ID });

      filter.catch(new Error('boom'), host);

      expect(getJsonBody(response).error.requestId).toBe(REQUEST_ID);
      const logMessage = errorSpy.mock.calls[0][0] as string;
      expect(logMessage).toContain(REQUEST_ID);
    });

    it('includes requestId in 4xx warn logs', () => {
      const { host } = createMockHost({ id: REQUEST_ID });

      filter.catch(
        new ForbiddenException({ code: 'FORBIDDEN', message: 'no' }),
        host,
      );

      const warnArg = warnSpy.mock.calls[0][0] as string;
      expect(warnArg).toContain(REQUEST_ID);
    });

    it('omits the requestId key entirely when req.id is absent', () => {
      const { host, response } = createMockHost();

      filter.catch(new Error('boom'), host);

      expect(getJsonBody(response).error).not.toHaveProperty('requestId');
    });
  });
});
