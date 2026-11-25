import { isTestEnvironment } from "@wonderhome/core/platform/environment";

/**
 * "TEST" pinned to the top of every screen on the test environment
 * (owner, 2026-11-25; docs/test-environment.md), so nobody mistakes it for
 * the household's real WonderHome. Rendered on the server from the
 * deployment's own variables; production renders nothing.
 */
export function TestEnvironmentBadge() {
  if (!isTestEnvironment()) return null;
  return (
    <div
      role="status"
      aria-label="Test environment"
      className="pointer-events-none fixed left-1/2 top-0 z-[100] -translate-x-1/2 rounded-b-md px-3 py-0.5 text-xs font-semibold tracking-widest"
      style={{ paddingTop: "max(0.125rem, env(safe-area-inset-top))", background: "var(--wh-attention)", color: "var(--wh-surface)" }}
    >
      TEST
    </div>
  );
}
