import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { DomainError, type ErrorBody } from "./domain-exceptions";

/** Nest's own status codes, as the machine codes the client expects. */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "bad_request",
  [HttpStatus.UNAUTHORIZED]: "unauthorized",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not_found",
  [HttpStatus.CONFLICT]: "conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "validation_failed",
};

/**
 * Every error leaves through here in one shape.
 *
 * Catching *everything* rather than only our own exceptions is the point: a
 * route Nest 404s itself, a guard's `ForbiddenException`, and an unhandled
 * crash would otherwise each escape in a different shape, and the client parses
 * exactly one (`lib/api-client.ts`). A response it cannot parse degrades to a
 * bare status code — the user is told "something went wrong" for a refusal the
 * server could have explained.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json(this.bodyFor(exception, status, request));
  }

  private bodyFor(exception: unknown, status: number, request: Request): ErrorBody {
    // Ours: the rule wrote its own `reason`, so pass the body through untouched.
    if (exception instanceof DomainError) {
      return exception.getResponse() as ErrorBody;
    }

    // Nest's own — rewritten into our envelope. Its default body already has
    // `error` and `message`, but as prose ("Not Found") where the client wants
    // a code, so it is re-derived from the status rather than reused.
    if (exception instanceof HttpException) {
      return {
        error: CODE_BY_STATUS[status] ?? "error",
        message: this.messageFrom(exception.getResponse(), exception.message),
      };
    }

    // Unexpected. The client gets nothing about the internals; the log gets all
    // of it, with the route, so it is findable.
    this.logger.error(
      `Unhandled ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return { error: "internal_error", message: "Something went wrong." };
  }

  /** Nest puts the useful text in different places depending on how it threw. */
  private messageFrom(payload: unknown, fallback: string): string {
    if (typeof payload === "string") return payload;
    if (typeof payload === "object" && payload !== null) {
      const { message } = payload as { message?: unknown };
      if (typeof message === "string") return message;
      // ValidationPipe returns an array of messages.
      if (Array.isArray(message) && message.length > 0) return String(message[0]);
    }
    return fallback;
  }
}
