/** How often an outcome is expected, read from the shape a playbook item's `cadence` column actually takes. */
export function cadenceLabel(cadence: Record<string, unknown> | null | undefined): string | undefined {
  if (!cadence) return undefined;
  const unit = cadence.unit ?? cadence.frequency ?? cadence.every;
  return typeof unit === "string" ? unit : undefined;
}
