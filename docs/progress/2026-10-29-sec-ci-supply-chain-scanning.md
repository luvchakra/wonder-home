# SEC-02: CI supply-chain scanning (2026-10-29)

**Done:** `.github/workflows/supply-chain.yml` (dependency gate + CycloneDX SBOM, gitleaks over full history, CodeQL report-only; SHA-pinned actions, least-privilege permissions), `.github/dependabot.yml` (grouped weekly), `.gitleaks.toml`, `scripts/audit-gate.mjs`, `docs/security/*`, `docs/CI.md`.

**Baseline:** production had 5 advisory groups (next critical; zod, sharp, source-map-js high; nodemailer moderate), all fixable; fixed here (Next 16.3.4 → 16.4.3 plus lockfile bumps). Production now 0. Dev-only: 8 advisories (vite/vitest), report-only.

**Verified:** `npm audit --omit=dev` 0; typecheck clean; `next build` compiled; gate script passes locally. Gitleaks and CodeQL could not run locally (binary download was blocked), so the history baseline is the first CI run.

**Open / owner:** turn on secret scanning + push protection and Dependabot alerts in GitHub settings; decide when CodeQL becomes blocking.
