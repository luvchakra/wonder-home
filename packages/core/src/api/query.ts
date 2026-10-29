import type { z } from "zod";

import { ApiError } from "./errors";
import { fieldErrors } from "./route";

/**
 * A request's query string, parsed against a schema before any of it is used
 * (SEC-03). A bad value is the standard 400 envelope naming the field, never
 * the value back and never an internal detail. Missing keys are `undefined`,
 * so a schema's `.optional()` / `.default()` apply.
 */
export function parseQuery<TSchema extends z.ZodType>(request: Request, schema: TSchema): z.output<TSchema> {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const key of new Set(params.keys())) raw[key] = params.get(key) ?? "";
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw ApiError.badRequest("Request query failed validation.", fieldErrors(parsed.error));
  return parsed.data;
}
