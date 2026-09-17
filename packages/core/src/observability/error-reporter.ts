import { redact } from "../security/redact";
import { log } from "./logger";

/**
 * Provider-neutral error reporting (story 00-009).
 *
 * No monitoring vendor is wired in yet, and inventing one would be a fake
 * integration. This is the seam: `setErrorReporter` accepts an adapter later,
 * and until one exists every report still lands in the structured log, so a
 * failure is never silently dropped while waiting for a decision.
 */

export type ErrorReport = {
  message: string;
  requestId?: string;
  /** Redacted before it leaves the process. */
  context?: Record<string, unknown>;
  /** Kept server-side only; never returned to a caller. */
  cause?: unknown;
};

export type ErrorReporter = (report: ErrorReport) => void;

let reporter: ErrorReporter | null = null;

export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

export function reportError(report: ErrorReport): void {
  const safe: ErrorReport = {
    message: report.message,
    requestId: report.requestId,
    context: redact(report.context ?? {}) as Record<string, unknown>,
  };

  log.error(safe.message, {
    requestId: safe.requestId,
    ...safe.context,
    errorName: report.cause instanceof Error ? report.cause.name : undefined,
  });

  reporter?.({ ...safe, cause: report.cause });
}
