/**
 * The speech key belongs to the deployment, not to a family (story 04-009,
 * revised).
 *
 * Asking every household to create a Google Cloud project, enable two APIs
 * and paste an API key is a developer's errand, not something a family
 * should do to be understood when they talk. Speech is infrastructure —
 * one project, one bill, one set of quotas — so the key is now the
 * `WONDERHOME_SPEECH_KEY` environment variable, read on the server the same
 * way `WONDERHOME_AI_KEY` already was.
 *
 * What stays per household is everything about *how* it sounds:
 * `household_voice_settings` is untouched. Only the credential goes.
 *
 * Safe to drop rather than deprecate: the table held no rows, so nothing
 * anybody configured is being discarded here.
 */

drop function if exists public.voice_credential_status(uuid);

drop table if exists public.household_voice_credentials;

notify pgrst, 'reload schema';
