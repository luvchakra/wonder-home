/**
 * Why a reading came back without one (2026-11-21), in a module of its own so
 * callers can tell without loading the intake prompt and its schema.
 */
export type ClassifyFailureReason = "refused" | "timeout" | "unreachable" | "declined" | "rejected";
export type ClassifyFailure = { failed: ClassifyFailureReason };

export function isClassifyFailure(value: unknown): value is ClassifyFailure {
  return typeof value === "object" && value !== null && "failed" in value && typeof (value as { failed: unknown }).failed === "string";
}
