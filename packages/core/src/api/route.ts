import { z } from "zod";

import { reportError } from "../observability/error-reporter";
import { ApiError, toErrorBody } from "./errors";
import { REQUEST_ID_HEADER, requestIdFrom } from "./request-id";

/**
 * The /api/v1 route wrapper.
 *
 * Every endpoint gets the same contract without restating it: a correlation id,
 * validated input, a typed JSON response, and the one error envelope. Business
 * logic lives in domain services — a route handler is a thin adapter.
 *
 * Authorization is deliberately NOT defaulted here. Each handler declares what
 * it requires, because a wrapper that silently authorizes is a wrapper that
 * eventually authorizes something it should not.
 */

export type RouteContext<TBody> = {
  request: Request;
  requestId: string;
  body: TBody;
};

export type RouteOptions<TSchema extends z.ZodTypeAny | undefined> = {
  /** Zod schema for the JSON request body. Omit for methods without one. */
  input?: TSchema;
};

type Handler<TBody> = (context: RouteContext<TBody>) => Promise<unknown> | unknown;

export function defineRoute<TSchema extends z.ZodTypeAny | undefined = undefined>(
  options: RouteOptions<TSchema>,
  handler: Handler<TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = requestIdFrom(request.headers);

    try {
      let body: unknown = undefined;

      if (options.input) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw ApiError.badRequest("Request body must be valid JSON.");
        }

        const parsed = options.input.safeParse(raw);
        if (!parsed.success) {
          throw ApiError.badRequest("Request body failed validation.", fieldErrors(parsed.error));
        }
        body = parsed.data;
      }

      const result = await handler({
        request,
        requestId,
        body: body as TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined,
      });

      if (result instanceof Response) {
        result.headers.set(REQUEST_ID_HEADER, requestId);
        return result;
      }

      return json(result, 200, requestId);
    } catch (thrown) {
      const { status, body } = toErrorBody(thrown, requestId);

      // Expected refusals (401/403/404/422) are normal traffic. An unexpected
      // failure is reported server-side, where the detail can safely live.
      if (status >= 500) {
        reportError({
          message: "Unhandled API failure",
          requestId,
          context: { method: request.method, path: new URL(request.url).pathname },
          cause: thrown,
        });
      }

      return json(body, status, requestId);
    }
  };
}

/** Flattens a Zod failure into `{ field: [messages] }` — no internals, no values. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "(body)";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function json(payload: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}
