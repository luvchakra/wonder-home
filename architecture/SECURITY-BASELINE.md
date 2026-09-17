# WonderHome — Security, Privacy & Governance Baseline

Security is a **foundation concern**, not a late module. Bootstrap, identity, API, database and every domain story must implement the applicable controls from day one. Module 15 later consolidates advanced controls and production evidence; it does not postpone basic security.

## P0 controls
- strict household tenant isolation
- server-side RBAC/privacy scopes
- secure authentication/session handling and MFA support
- step-up authentication for payment, export, deletion and privileged operations
- encryption in transit and at rest
- managed secrets; never commit credentials
- secure cookies, CSRF protections where applicable, CSP, HSTS and security headers
- safe audit logging
- prompt-injection defenses and tool authorization
- SSRF, injection, upload, session and authorization regression tests
- dependency/SBOM scanning
- rate limiting and abuse controls
- retention, export and deletion controls
- explicit consent for external integrations
- child privacy boundaries
- helper/service identity boundaries
- separate `/platform-admin` authorization boundary

## AI privacy
Use minimum necessary context. Anthropic Claude is the primary configured provider; Google and OpenAI may be configured through the provider abstraction. Provider data-use/retention controls and household consent must be represented before sensitive content is sent. Household content is not used for model training by default.

## Security release gate
No critical/high security finding may remain open for production. All P0 authorization and tenant-isolation tests must pass.

Reference concepts: OWASP ASVS and OWASP Top 10. This baseline is not a substitute for a professional security review.
