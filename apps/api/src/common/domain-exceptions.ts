import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * The error envelope the frontend already parses (see `lib/api-client.ts` in the
 * web app): `error` is the machine code, `message` is an English fallback for
 * logs, and `reason` is the refusal **as the rule stated it** — a structured
 * code plus its numbers, never a sentence.
 *
 * That last field is the whole point. `@plotguard/rules` returns codes so the
 * same refusal can be worded per locale by whoever is reading it; a server that
 * flattened them into English would decide the user's language for them.
 */
export interface ErrorBody {
  error: string;
  message: string;
  /** Present when a domain rule refused. Shape is the rule's own blocker type. */
  reason?: unknown;
  /** Which field the refusal is about, when the rule names one. */
  field?: string;
}

/**
 * Base class for the refusals we write ourselves.
 *
 * The filter checks `instanceof` against this rather than sniffing the payload
 * for `error`/`message` fields: Nest's *own* exceptions serialise to a body
 * carrying both (`{ statusCode, error: "Not Found", message }`), so duck-typing
 * lets a framework 404 through wearing `error: "Not Found"` where the client
 * expects `not_found`. A marker class cannot be impersonated by coincidence.
 */
export abstract class DomainError extends HttpException {}

export class NotFoundError extends DomainError {
  constructor(message = "Not found") {
    super({ error: "not_found", message } satisfies ErrorBody, HttpStatus.NOT_FOUND);
  }
}

/**
 * A domain rule refused the write. `reason` is the blocker straight off the
 * rule — `{ code: "unheard", parties: [...] }` and the like.
 */
export class ValidationError extends DomainError {
  constructor(reason: { code: string } & Record<string, unknown>, field?: string) {
    super(
      {
        error: "validation_failed",
        // The English here is for logs and for a client that does not recognise
        // the code. The client that does recognise it words the code itself.
        message: `Validation failed: ${reason.code}`,
        reason,
        ...(field ? { field } : {}),
      } satisfies ErrorBody,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Other records still point at this one — the referential refusal. */
export class ConflictError extends DomainError {
  constructor(message: string, reason?: unknown) {
    super(
      { error: "conflict", message, ...(reason ? { reason } : {}) } satisfies ErrorBody,
      HttpStatus.CONFLICT,
    );
  }
}
