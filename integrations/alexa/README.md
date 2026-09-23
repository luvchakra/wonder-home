# WonderHome Alexa skill

Alexa is a channel into HomeTalk (voice integration phase 4,
`design/voice-integration/04-alexa-hometalk-skill.md`). The skill holds no
logic of its own: every request goes to `POST /api/v1/voice/alexa`, which
proves it came from Alexa, resolves the linked WonderHome member from the
account-linking token, and runs the turn through the same HomeTalk gateway
as the web app — under that member's own RLS and the scopes they chose.

## What is in this folder

- `skill-package/interactionModels/custom/*.json`: the interaction model.
  It is generated from `packages/core/src/voicelink/alexa.ts`
  (`alexaInteractionModel`), and `alexa.test.ts` fails if the two drift.
  Each carrier word has its own intent, because Alexa's free-text slot
  (`AMAZON.SearchQuery`) drops the word in front of it. The endpoint puts
  that word back before HomeTalk hears it.

## Making it live (a person's errand — nothing here invents credentials)

1. Create a **Custom** skill in the Alexa developer console. Set the
   invocation name to "wonder home", and paste in the interaction model for
   each locale you publish.
2. Set the endpoint to `https://<your domain>/api/v1/voice/alexa`, with
   the certificate type for a domain that has a trusted certificate.
3. **Account linking**, using an authorization-code grant:
   - Authorization URI: `https://<your domain>/oauth/voice/authorize`.
   - Access token URI: `https://<your domain>/api/v1/oauth/voice/token`.
   - Client authentication: HTTP Basic.
   - PKCE on, if the console offers it.
   - Choose a client ID and a secret of at least 16 characters.
   - Scopes (all optional; the member picks on WonderHome's consent page):
     `household.read calendar.read meals.read groceries.read groceries.write home.read pets.read notifications.create`.
4. Set these environment variables in the deployment:
   - `ALEXA_SKILL_ID`: the skill's `amzn1.ask.skill.…` id.
   - `ALEXA_OAUTH_CLIENT_ID` and `ALEXA_OAUTH_CLIENT_SECRET`: as entered
     in step 3.
   - `ALEXA_OAUTH_REDIRECT_URIS`: the console's "Alexa Redirect URLs",
     comma separated, exactly as shown.
5. Enable the skill in the Alexa app and link your WonderHome account.
   WonderHome's consent page lets you choose what Alexa may do. You can
   unlink it at any time from Settings → Voice assistants.

Until those are set, the endpoint answers 401, the consent page says linking
isn't set up, and the settings page says so too.
