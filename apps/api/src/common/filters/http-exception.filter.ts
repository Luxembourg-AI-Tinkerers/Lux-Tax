import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/** What a 5xx says unless someone explicitly opted into more. */
const SAFE_5XX_MESSAGE = 'An unexpected error occurred. Please try again later.';

/**
 * Database errors are the richest leak we have: Prisma embeds the failing
 * invocation, node-postgres embeds the statement and its bound values. They are
 * never serialised to a client, not even when EXPOSE_ERROR_DETAILS is on.
 */
function isDatabaseError(exception: unknown, message: string): boolean {
  if (!exception || typeof exception !== 'object') {
    return /PrismaClient|Invalid `prisma\.|prisma\.\$|\$queryRawUnsafe|\$executeRawUnsafe/.test(message);
  }

  const error = exception as Record<string, unknown>;
  if (typeof error.name === 'string' && error.name.startsWith('PrismaClient')) {
    return true;
  }
  // P#### = Prisma request/validation code; ##### = SQLSTATE from node-postgres.
  if (typeof error.code === 'string' && (/^P\d{4}$/.test(error.code) || /^\d{5}$/.test(error.code))) {
    return true;
  }
  // node-postgres attaches the server's severity/routine to the thrown error.
  if (typeof error.severity === 'string' || typeof error.routine === 'string') {
    return true;
  }
  return /PrismaClient|Invalid `prisma\.|prisma\.\$|\$queryRawUnsafe|\$executeRawUnsafe|22P02|P20\d{2}/.test(
    message,
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      message = (exceptionResponse as any).message || (exceptionResponse as any).error || message;
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // 4xx messages are written by us and are what the client needs; 5xx details
    // stay server-side unless EXPOSE_ERROR_DETAILS=true was set on purpose.
    // An unset NODE_ENV used to mean "development" and leaked everything.
    let clientMessage = message;
    if (status >= 500) {
      const exposeDetails = process.env.EXPOSE_ERROR_DETAILS === 'true';
      clientMessage =
        exposeDetails && !isDatabaseError(exception, message) ? message : SAFE_5XX_MESSAGE;
    }

    if (status >= 500) {
      this.logger.error(
        `HTTP ${status} Error on ${request.method} ${request.url}: ${message}`,
        exception instanceof Error ? exception.stack : undefined
      );
    }

    response.status(status).send({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: clientMessage,
    });
  }
}
