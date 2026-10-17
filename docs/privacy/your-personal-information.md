# Your personal information

*The same words a family reads in the app, at `/legal#your-information`. The short line under every form that asks for personal details links there.*

You are trusting us with things that matter: where your family lives, when your children were born, their faces. We know that, and we look after them the way we would want our own family's looked after.

- **It stays inside your home.** Only the people in your household can see your family's details, and only what their role allows. Your home address is seen by the adults, never by helpers or children.
- **It is locked up.** Everything travels over an encrypted connection and is stored encrypted. Photos are kept in private storage and shown through links that stop working within the hour.
- **We only ask for what helps.** Almost every detail is optional. Leave out anything you would rather not share.
- **We never sell it.** Your information is never sold, never used for advertising, and never used to train AI models. When you look up an address or a school, what you type goes to Google Maps, along with your home's location when it is finding schools near you. Nothing else about your family goes with it.
- **You stay in charge.** You can correct anything, download a copy of everything, or ask us to delete it all from Settings → Privacy & security.

We build WonderHome around the principles of the privacy laws that protect families where we work:
- India's [Digital Personal Data Protection Act, 2023](https://www.meity.gov.in/data-protection-framework);
- Europe's [General Data Protection Regulation (GDPR)](https://eur-lex.europa.eu/eli/reg/2016/679/oj).

Their principles are:
- ask only for what is needed;
- use it only for what you asked;
- keep it safe;
- let you see, correct and erase it.

WonderHome has not yet been through a formal audit against either law, and we will say so until it has.

## Where each promise is kept in the code

Every line above is something the software does today. When one stops being true, this page and `/legal` change in the same pull request.

| Promise | Where it is enforced |
|---|---|
| Only your household; only what a role allows | Row level security on every household table (`supabase/migrations/`), checked by `npm run test:db` |
| The home address is adults-only | `household_addresses` policies; `scripts/test-household-address-rls.mjs` |
| Encrypted in transit | HTTPS only, with HSTS (`packages/core/src/security/headers.ts`) |
| Encrypted at rest | The database and Storage are hosted on Supabase, which encrypts at rest |
| Photos are private | The `avatars` bucket is private; signed links last an hour (`identity/households.ts`) |
| Not used to train AI | `/legal`; there is no setting that changes it |
| What reaches Google Maps | `places/google.ts`: the typed search, the household's region and language, and the home's point only for a school search |
| Correct, download, delete | Settings; `privacy/export.ts`, `privacy/fulfill-deletion.ts` |

**Not claimed:** compliance with or certification under any law or standard. That needs a legal review and, where it applies, an audit, which are a person's decisions.
