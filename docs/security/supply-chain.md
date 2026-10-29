# Supply-chain scanning (SEC-02)

All of it runs on GitHub Actions (`.github/workflows/supply-chain.yml`), never on Vercel, and never deploys. Every third-party action is pinned to a full commit SHA; the workflow's default permissions are `contents: read`. Dependabot (`.github/dependabot.yml`) keeps the pins and the npm tree current, one grouped PR a week.

| Check | Runs on | Blocks? |
|---|---|---|
| Dependency audit (`scripts/audit-gate.mjs`) | PRs, `main`, weekly | **Yes**: a high or critical **production** advisory not in the baseline. Dev-only and moderate-or-lower are listed, not blocking. |
| SBOM (`npm sbom`, CycloneDX, production) | same | No. Uploaded as the `dependency-reports` artifact with `audit.json`. |
| Secret scan of the whole git history (gitleaks, `.gitleaks.toml`) | same | **Yes**. |
| CodeQL (JavaScript/TypeScript) | same | No (report-only, Security tab). Becomes blocking once the first findings are triaged. |

## Triage
- **Advisory with a fix:** bump it (`npm audit fix --omit=dev`; Next.js is pinned exactly in `apps/web`, `packages/core` and `eslint-config-next`: change all three), run typecheck and the build.
- **No fix, or a bump that cannot ship yet:** add `{ "id": "GHSA-…", "package": "…", "reason": "…", "owner": "…", "date": "YYYY-MM-DD" }` to `accepted` in `docs/security/dependency-baseline.json`, and a row to `dependency-baseline.md`. The gate then fails only on new findings. Remove the entry when fixed.
- **Secret found:** do not paste it anywhere. Rotate it first, then add a `[allowlist]` entry in `.gitleaks.toml` only if it was a placeholder.

## Owner settings (GitHub → Settings → Code security)
Secret scanning and **push protection** are repository settings, not files: turn both on. Dependabot alerts and security updates likewise. CodeQL results appear under Security → Code scanning.
