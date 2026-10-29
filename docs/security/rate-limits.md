# Rate limits (SEC-06)

Table: `RATE_LIMITS` in `packages/core/src/security/rate-limit.ts`; the Postgres counter is `public.rate_limit_hit`.
A limit is a throttle, not an authorization gate: if the counter is unreachable the request is let through.

## Observability
- A refusal logs `rate limit reached` once per bucket per minute per server instance (`event: rate_limit_rejected`,
  `limiter`, `scope`, `subject` = 8-hex digest of the subject), then one `rate limit summary` line with the count and
  distinct subjects. Ids, addresses and numbers are never logged, and nothing is written to the database per refusal.
- A counter failure (fail-open brown-out) logs `rate limit unavailable; allowing` at **error** level, `event:
  rate_limit_unavailable`, once a minute per instance. Alert on that message in Vercel log drains.

## Limits
Per-household buckets marked ★ were added by SEC-06; they sit beside the member bucket and a request must pass both
(`hitRateLimitFair`, member first).

| Bucket | Counts | Max / window |
|---|---|---|
| `hometalk.turn` | member | 30 / 60 s |
| ★ `hometalk.turn.household` | household | 120 / 60 s |
| `ai.model` | household | 150 / 1 h |
| `homesend.intake` (uploads, pastes, shares) | member | 30 / 10 min |
| ★ `homesend.intake.household` | household | 100 / 10 min |
| `homesend.link` (outbound fetch) | member | 15 / 10 min |
| ★ `homesend.link.household` | household | 40 / 10 min |
| `homesend.email` | household | 60 / 1 h |
| `homesend.whatsapp` | member | 60 / 1 h |
| ★ `homesend.whatsapp.household` | household | 200 / 1 h |
| `whatsapp.link` | member | 6 / 1 h |
| `whatsapp.unlinked` | phone | 3 / 1 h |
| `voice.token` | OAuth client | 120 / 10 min |
| `voice.request` | voice link | 60 / 10 min |
| `voice.session` | member | 20 / 10 min |
| ★ `voice.session.household` | household | 60 / 10 min |
| `voice.tool` | live session | 120 / 15 min |
| `voice.transcribe` | member | 120 / 15 min |
| `notification.test` | member | 8 / 10 min |
| `weather.search` | member | 30 / 10 min |
| `places.search` | member | 120 / 10 min |
| `places.find` | household | 30 / 1 h |
| `event.reply` | hashed IP | 20 / 10 min |
| `auth.attempt` | hashed IP | 30 / 10 min |
| `careers.apply` / `careers.status` | hashed IP | 10 / 1 h, 30 / 1 h |
| `partner.request` | API key | 120 / 60 s |
| `instamart.match` / `instamart.cart` | member | 6 / 15 min, 30 / 15 min |

Not done: a short-TTL fallback cap while the counter is down (it risks over-blocking; the alert is the control).
Email intake was already per household.
