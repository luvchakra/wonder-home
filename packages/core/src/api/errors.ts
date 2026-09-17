/**
 * The one API error shape (architecture/API-ARCHITECTURE.md):
 *
 *   { error: { code, message, details?, requestId } }
 *
 * Nothing else crosses the boundary. No stack traces, no secrets, no provider
 * tokens, no household content that the caller did not already have.
 */

export const API_ERROR_CODES = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_CODES;

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

/**
 * An error that is safe to show a caller. Anything thrown that is *not* an
 * ApiError becomes a generic `internal` — an unexpected failure never gets to
 * describe itself to the outside world.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError("bad_request", message, details);
  }

  static unauthenticated(message = "Authentication required.") {
    return new ApiError("unauthenticated", message);
  }

  static forbidden(message = "You do not have access to this household resource.") {
    return new ApiError("forbidden", message);
  }

  static notFound(message = "Not found.") {
    return new ApiError("not_found", message);
  }

  /** The request was valid but the world already says otherwise. */
  static conflict(message: string, details?: unknown) {
    return new ApiError("conflict", message, details);
  }
}

export function statusForCode(code: ApiErrorCode): number {
  return API_ERROR_CODES[code];
}

export function errorBody(code: ApiErrorCode, message: string, requestId: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message, requestId } : { code, message, details, requestId } };
}

/**
 * Maps an unknown thrown value to a safe envelope. Only ApiError keeps its
 * message; everything else is reported as an opaque internal error, with the
 * requestId as the thread back to the server-side log entry.
 */
export function toErrorBody(thrown: unknown, requestId: string): { status: number; body: ApiErrorBody } {
  if (thrown instanceof ApiError) {
    return {
      status: statusForCode(thrown.code),
      body: errorBody(thrown.code, thrown.message, requestId, thrown.details),
    };
  }
  return {
    status: 500,
    body: errorBody("internal", "Something went wrong. Quote the request id if you report this.", requestId),
  };
}
