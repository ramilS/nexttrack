import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';
import { DomainError } from '@/common/errors/domain.errors';
import { httpStatusOf } from '@/common/errors/domain-error-status';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    statusCode: number;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

const PRISMA_ERROR_MAP: Record<
  string,
  { status: number; code: string; message: string }
> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    code: 'CONFLICT',
    message: 'A record with this value already exists',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    code: 'NOT_FOUND',
    message: 'Record not found',
  },
};

const PRISMA_FALLBACK = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'DATABASE_ERROR',
  message: 'A database error occurred',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      typeof request.id === 'string' && request.id.length > 0
        ? request.id
        : undefined;

    if (exception instanceof DomainError) {
      this.handleDomainError(exception, request, response, requestId);
      return;
    }

    if (exception instanceof HttpException) {
      this.handleHttpException(exception, request, response, requestId);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.handlePrismaError(exception, request, response, requestId);
      return;
    }

    this.handleUnknownError(exception, request, response, requestId);
  }

  private handleDomainError(
    exception: DomainError,
    request: Request,
    response: Response,
    requestId: string | undefined,
  ) {
    const status = httpStatusOf(exception);

    this.logger.warn(
      `${request.method} ${request.url} ${status} - ${exception.code}${this.requestIdSuffix(requestId)}`,
    );

    const envelope = this.buildEnvelope(
      exception.code,
      exception.message,
      status,
      requestId,
    );
    if (exception.details) {
      envelope.error.details = exception.details;
    }
    response.status(status).json(envelope);
  }

  private handleHttpException(
    exception: HttpException,
    request: Request,
    response: Response,
    requestId: string | undefined,
  ) {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const responseBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as {
            code?: string;
            message?: string;
            detail?: string;
          })
        : null;

    const errorResponse: ErrorEnvelope =
      typeof exceptionResponse === 'string'
        ? this.buildEnvelope('UNKNOWN_ERROR', exceptionResponse, status, requestId)
        : this.buildEnvelope(
            responseBody?.code || responseBody?.message || 'UNKNOWN_ERROR',
            responseBody?.detail || responseBody?.message || 'An error occurred',
            status,
            requestId,
          );

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} ${status} - ${exception.message}${this.requestIdSuffix(requestId)}`,
        exception.stack,
      );
    } else if (status >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(
        `${request.method} ${request.url} ${status} - ${errorResponse.error.code}${this.requestIdSuffix(requestId)}`,
      );
    }

    response.status(status).json(errorResponse);
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    request: Request,
    response: Response,
    requestId: string | undefined,
  ) {
    const mapping = PRISMA_ERROR_MAP[exception.code] ?? PRISMA_FALLBACK;

    const logLine = `${request.method} ${request.url} ${mapping.status} - Prisma ${exception.code}: ${exception.message}${this.requestIdSuffix(requestId)}`;
    if (mapping.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logLine, exception.stack);
    } else {
      this.logger.warn(logLine);
    }

    response
      .status(mapping.status)
      .json(
        this.buildEnvelope(mapping.code, mapping.message, mapping.status, requestId),
      );
  }

  private handleUnknownError(
    exception: unknown,
    request: Request,
    response: Response,
    requestId: string | undefined,
  ) {
    const message =
      exception instanceof Error ? exception.message : 'Unknown error';
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `${request.method} ${request.url} 500 - Unhandled: ${message}${this.requestIdSuffix(requestId)}`,
      stack,
    );

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        this.buildEnvelope(
          'INTERNAL_SERVER_ERROR',
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          requestId,
        ),
      );
  }

  private buildEnvelope(
    code: string,
    message: string,
    statusCode: number,
    requestId: string | undefined,
  ): ErrorEnvelope {
    return {
      error: {
        code,
        message,
        statusCode,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  private requestIdSuffix(requestId: string | undefined): string {
    return requestId ? ` [requestId=${requestId}]` : '';
  }
}
