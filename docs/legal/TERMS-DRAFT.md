# Terms of Service and Acceptable Use — DRAFT for legal review

> **Status: draft, not published.** Written 2026-10-21 as part of the
> reverse-engineering hardening pass
> (`docs/progress/2026-10-21-reverse-engineering-hardening.md`). Nothing here
> binds anyone until a lawyer has reviewed it, the owner has published it at
> `/legal`, and sign-up asks people to accept it. `/legal` says honestly that
> formal terms have not been published yet, and it must keep saying so until
> then.

Placeholders in `[brackets]` are the owner's to fill in.

## 1. Who we are

WonderHome is operated by `[legal entity name]`, `[registered address]`
("we", "us"). These terms govern your use of the WonderHome website, apps and
services (the "Service").

## 2. Your account and your household

- You must be at least `[18]` to create an account. Children use WonderHome
  only as members of a household an adult created, with the access their
  guardian sets.
- You are responsible for what happens under your account and for keeping
  your sign-in details private.
- Your household's records are yours. We process them only to run the
  Service for you, as described in the Privacy Policy.

## 3. Acceptable use

You agree not to, and not to help anyone else to:

1. **Reverse engineer** — decompile, disassemble or otherwise try to derive
   the source code, models, prompts, algorithms, data structures or
   non-public interfaces of the Service, except where the law gives you a
   right to do so that cannot be waived.
2. **Scrape or access by automation** — use bots, crawlers, scrapers, AI
   agents, browser automation or any other automated means to access,
   collect or copy any part of the Service, except through an API and key we
   have issued to you for that purpose, within its documented limits.
3. **Train models** — use the Service, its content or its outputs to train,
   fine-tune, distil, evaluate or benchmark any machine-learning or AI model.
4. **Build a competing product** — access or use the Service to design,
   build or help build a product or service that competes with WonderHome, or
   to copy its features, interface, workflows or content.
5. **Get around limits or security** — bypass rate limits, access controls or
   plan limits; probe, scan or test the Service's vulnerability (other than
   through a responsible-disclosure programme we publish); or access another
   household's data.
6. **Misuse it** — upload malware, send spam, impersonate anyone, or use the
   Service for anything unlawful or harmful, including anything that
   endangers a child.
7. **Resell it** — sell, rent, sublicense or provide the Service to third
   parties, or frame or mirror any part of it.

## 4. Our intellectual property

The Service — its software, design, brand, prompts, catalog curation and
documentation — belongs to us and our licensors. These terms give you a
personal, non-exclusive, non-transferable, revocable right to use the
Service for your household's own purposes. Nothing else is licensed.

## 5. AI features

- WonderHome's assistant uses third-party AI providers to understand
  requests and word answers. What reaches a provider is limited by the
  settings an Admin chooses (Settings → AI Assistant).
- AI-generated answers can be wrong. Check anything important — health,
  money, a child's school — against the source record.
- Paying and ordering always wait for a person's confirmation.

## 6. Enforcement

If we reasonably believe you have broken section 3, we may rate-limit,
suspend or close the account, and may take legal action. Where possible we
will tell you first and give you the chance to export your household's data.

## 7. Plans and payment

`[Pricing, billing, renewal, cancellation and refund terms — to be written
once a payment provider is live; see the billing section of CLAUDE.md.]`

## 8. Disclaimers and liability

`[Standard warranty disclaimer and limitation of liability, for counsel to
draft for the governing jurisdiction.]`

## 9. Changes, law and contact

- We will give notice of material changes before they take effect. The
  version you accepted, and when, is kept with your account.
- Governing law: `[India]`; courts of `[city]`.
- Contact: `[address]` — the same one the landing page's contact section
  gives.

---

## Notes for the reviewer

- **Acceptance in code is not built yet.** Once these terms are final,
  sign-up should carry a required "I agree" checkbox and store the accepted
  version and time per account (a `terms_acceptances` table: user id,
  version, accepted at). Until then the sign-up line ("By creating an
  account you agree to our terms and privacy") links to `/legal`, which says
  terms are not yet published.
- **The repository's `LICENSE`** already states the same reverse-engineering,
  scraping, training and competing-product restrictions for the code itself.
