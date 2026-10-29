# Dependency baseline (2026-10-29)

`npm audit` at SEC-02. The machine-read list is `dependency-baseline.json`.

**Production: 5 advisory groups before, 0 after.** Fixed in this change: `next` 16.3.4 → 16.4.3 (critical; several RCE/cache advisories), `zod`, `sharp`, `source-map-js` (high), `nodemailer` (moderate), by lockfile bumps. Typecheck and `next build` pass.

**Accepted (blocking list): none.**

**Dev-only, report-only (8 advisories, 3 packages):** `vite` (1 high, 5 moderate/low), `@vitest/mocker`, `vitest`. Test tooling only, not shipped; a fix exists. Owner: build lead, burn down with the next Vitest bump (target 2026-11-15).
