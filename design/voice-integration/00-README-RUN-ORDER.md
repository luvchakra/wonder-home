# WonderHome Voice Integration — Claude Code Execution Order

Run these files in this exact order:

1. `01-hometalk-voice-gateway-foundation.md`
   - Creates the provider-neutral HomeTalk voice boundary.
2. `02-external-voice-identity-and-auth.md`
   - Creates external voice identity/account-linking/security foundation.
3. `03-gemini-voice-assistant.md`
   - Implements Gemini Voice using the Gemini Live API as a HomeTalk channel.
4. `04-alexa-hometalk-skill.md`
   - Implements Alexa as another HomeTalk channel.
5. `05-unified-voice-ux-and-capabilities.md`
   - Harmonizes behavior and capability policy across channels.
6. `06-voice-integration-evaluation-and-hardening.md`
   - Runs the final security, golden-household and production hardening work.

## Claude Code instruction

For each file:

- First inspect the current `main` branch and relevant existing implementation.
- Reuse existing abstractions instead of duplicating them.
- Implement only the scope of the current phase.
- Run relevant tests.
- Fix failures caused by the implementation.
- Do not weaken RLS, RBAC, autonomy, approval or privacy controls.
- Do not create direct model-to-database access.
- At the end, report files changed, tests run, results, and blockers.

## Important interpretation

"Gemini Voice Assistant" in these requirements means a WonderHome voice experience using Google's Gemini Live API capabilities. It does not assume that WonderHome can directly modify or embed itself into the consumer Gemini app/Google Assistant unless Google's currently available public APIs explicitly support that integration.

Verify current Google and Amazon documentation during implementation because provider APIs and certification requirements can change.
