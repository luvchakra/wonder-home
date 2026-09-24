# Alexa skill: the implementation spec checked against what exists, and the gaps closed

**Spec:** `WonderHome_Alexa_Skill_Claude_Code.md`, supplied 2026-09-24. It restates voice integration phase 4 (`design/voice-integration/04-alexa-hometalk-skill.md`), which was already built (see `2026-09-23-voice-hometalk-gateway-linking-alexa.md`). This pass checked each section of the spec against the code, and built only what was missing.

## Implementation summary

**What already met the spec**

The architecture (§1–§8, §13, §17–§20, §22–§24) was already in place, so none of it was rebuilt:

- **Endpoint.** `POST /api/v1/voice/alexa` sends every turn through the one HomeTalk gateway (`hometalk/gateway.ts`), under the linked member's own RLS session (`voicelink/member-session.ts`). Alexa never writes to a table.
- **Request verification** follows Amazon's documented rules:
  - the certificate URL rules and the chain up to a trusted root;
  - the `echo-api.amazon.com` name on the certificate;
  - an RSA-SHA256 signature over the exact body;
  - a 150-second timestamp window;
  - the pinned skill id.
- **Account linking.** WonderHome is its own OAuth 2.0 server: authorization code, S256 PKCE, and hashed, prefixed tokens (`voicelink/oauth.ts`, `repository.ts`).
  - Refresh tokens rotate, and a replayed one revokes every token for that link.
  - Revoke and unlink live in Settings → Voice assistants.
  - Scopes only narrow what the member may already do, and payments and orders never go ahead by voice.
- **Identity.** The speaker is whoever the WonderHome token was issued to, never Amazon's account id.
- **Governance.** Scope, then entitlement, then permission, then autonomy. The capability matrix is `voicelink/capabilities.ts`, and a spoken "yes" is judged by HomeTalk's own rules.
- **Idempotency.** Keyed on the channel and the Alexa request id.
- **Rate limit.** `voice.request`, per linked identity.
- **Records.** One content-free `hometalk_channel_events` row per turn.

**What was missing, and is now built**

1. **Multi-turn answers (§14, §15).** "What would you like to add?" — "Milk." used to reach `AMAZON.FallbackIntent`, because Alexa's free-text slot can't stand alone.
   - New `WonderHomeAnswerIntent` with the samples `{answer}`, `it's {answer}`, `it is {answer}` and `just {answer}`.
   - It uses a custom slot type, `WONDERHOME_ANSWER`. Custom types accept words they were never given; the listed values only teach Alexa the shape of a short answer.
   - HomeTalk completes its pending clarification from the answer, which is existing behaviour covered by `clarify.test.ts`. An empty answer is asked again, never guessed.
2. **Status intent (§12).** New `WonderHomeStatusIntent` with no slot.
   - Samples: "for today's summary", "what needs attention", "what's pending", "what's important today", "catch me up" and others.
   - It asks HomeTalk "what needs attention today", which the existing status rules answer (`looksLikeStatusQuestion` holds).
3. **Action verbs (§11).** New carrier intents for:
   - `create`, `set`, `schedule`, `book`, `order`, `buy`, `change`, `update`, `delete`, `clear`;
   - `complete`, `finish`, `undo`, `log`, `note`, `show`, `give me`, `list`, `check`, `find`, `read`;
   - `any` and `anything`.

   Each one only puts the word back in front of what was said, and HomeTalk decides.
4. **Reminder phrasing (§3, §19).** "Set a reminder to…", "create a reminder about…" and "add a reminder…" now read as the existing `set_reminder` action, in the rules, for every channel. "Add a reminder to buy milk" is never read as a grocery.
5. **Observability (§30).** Every refused request logs `alexa.request.rejected` with a closed reason and its status, and nothing else. The reasons are `not_configured`, `too_large`, `cert_url`, `cert_fetch`, `cert_invalid`, `signature`, `malformed`, `stale` and `wrong_skill`.
6. **`.env.example` (§25).** Placeholders for `ALEXA_SKILL_ID` and `ALEXA_OAUTH_CLIENT_ID/_SECRET/_REDIRECT_URIS`.
7. **README (§29).** `integrations/alexa/README.md` now covers the new intents, when to re-paste the model, phrases to try, and troubleshooting by rejection reason.

## Files changed

- `packages/core/src/voicelink/alexa.ts`: the new intents, the answer slot type, the new verbs, and the status mapping.
- `apps/web/app/api/v1/voice/alexa/route.ts`: rejection reasons and logging.
- `integrations/alexa/skill-package/interactionModels/custom/{en-IN,en-US,en-GB}.json`: regenerated from code.
- `packages/core/src/conversation/rules.ts`: the reminder synonym.
- `packages/core/src/voicelink/readiness.ts`: the voice gate now runs Alexa phrases through `alexaTurn` itself, and has 8 golden phrases (was 4).
- Tests: `voicelink/alexa.test.ts`, `voice-golden.test.ts`, `conversation/rules.test.ts`, `homebrain/evaluations.test.ts`.
- Docs: `.env.example`, `integrations/alexa/README.md`, this note.

## Changes by area

- **Database.** None. The existing `external_voice_identities` and `voice_oauth_grants` tables are the §24 identity mapping.
- **API.** None to any contract. The Alexa endpoint only logs more.

## Tests

- **Voice link suite:** 102 tests (was 98).
- **Rules, HomeTalk evaluation and HomeBrain golden suites:** 182 tests.
- **`npm run eval`:** every blocking gate passes, including `voice` (15/15 Gemini sentences and 8/8 Alexa phrases) and `security` (Unsafe Action Rate 0/14).
- **The spec's security list** is covered by existing tests in `alexa.test.ts` and the voice-link DB suite:
  - an invalid signature, the wrong skill id, a stale request, a certificate for another domain or an untrusted chain, and a malformed body;
  - an unlinked or revoked token;
  - a code or refresh token presented twice, which revokes the link;
  - scope narrowing, and payments and orders refused by voice.

## Known limitations

- **Real Alexa not exercised.** No real Alexa device or simulator run has happened. The skill needs a person to create it and set `ALEXA_*`, and until then the endpoint answers 401.
- **"Mark the laundry as done."** HomeTalk reads this as completing a school item, since laundry is not a completable record in WonderHome. It can't write anything wrong: it only acts on a school item that actually exists, and otherwise asks. Giving laundry a completion executor would be new domain behaviour, which the spec rules out (§19).
- **No Alexa dialog delegation (§16).** HomeTalk's own clarification covers slot collection, so a second, Alexa-side dialog state was not added.

## Manual Alexa developer-console steps

These are in `integrations/alexa/README.md`:

1. Create a Custom skill with the invocation name "wonder home".
2. Paste the interaction model for each locale.
3. Set the endpoint to `https://<domain>/api/v1/voice/alexa`.
4. Configure account linking:
   - authorization-code grant;
   - `/oauth/voice/authorize` and `/api/v1/oauth/voice/token`;
   - HTTP Basic client authentication;
   - PKCE.
5. Set `ALEXA_SKILL_ID`, `ALEXA_OAUTH_CLIENT_ID`, `ALEXA_OAUTH_CLIENT_SECRET` and `ALEXA_OAUTH_REDIRECT_URIS`.
6. Enable the skill in the Alexa app and link a WonderHome account.
7. Check Amazon's current certification requirements before publishing: privacy policy, terms and testing instructions.
