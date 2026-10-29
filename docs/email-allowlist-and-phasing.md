# Email intake: the sender allowlist, and forwarding before OAuth

Design note for story 17-016 (and the queued 17-017). Read with `docs/external-providers.md` (email is an input channel, inert until its variables are set) and `docs/hometalk-homesend-design.md`.

## The problem

A household wants WonderHome to read some of its mail — bills, receipts, school circulars — and turn it into HomeSend items. The owner's hard constraint (2026-10-29): WonderHome must read mail **only from senders the household approved**, and nothing else should ever be read, stored, or logged with its content.

So the feature is not "connect your email"; it is "approve a few senders, and only those are read." The allowlist is the product, not a setting on the side of it.

## Two ways in, phased

There are two ways a household can give WonderHome mail. They differ in how the mail arrives, not in what is allowed to be read — the allowlist gate is identical for both.

1. **Forwarding (phase 1, shipped).** The household forwards mail to its own unguessable address (`hs-<token>@<domain>`), or — better — sets an auto-forward rule in its mail provider so approved senders are forwarded automatically. The inbound Resend webhook receives it. WonderHome never holds a credential to the inbox and never signs in. This is simple, private by construction (we only ever see what is forwarded), and ships now.
2. **Account sign-in (phase 2, queued as 17-017).** The household connects a mailbox by OAuth with a read-only scope; WonderHome pulls mail. This is more convenient (no forwarding rule to set up) but needs a real OAuth integration, consent flow, and the trust of a read token. It reuses the dormant connected-mailbox path (`finance/email-connector`, `integrations/email/sync`) and the **same** allowlist gate at its sync boundary.

Forwarding first, because it is the smaller, safer surface and gives the household control immediately; OAuth is a convenience layer added on the same gate later.

## The gate

- Approved senders live in `homesend_email_allowlist`, one row per rule per household: an exact address (`bills@bescom.co.in`) or a whole domain (`school.edu`). Member-readable, Admin-writable.
- Matching (`senderMatchesAllowlist`) is pure and strict: an **empty list matches no one**; an address matches only itself; a domain matches its own addresses and not a subdomain (`mail.school.edu`) or a look-alike (`school.edu.evil.com`).
- The webhook learns the sender only after fetching the message (the delivery event carries no sender), so the gate is there. A sender no recipient household approved is dropped before anything is stored — no item, no attachment fetch, no content in logs, just a non-personal `dropped_not_allowlisted` counter.
- **Default empty = nothing read.** This is the safe default and it is explicit in the UI, so no one expects mail to flow before approving a sender.

## Who approves senders

**Admins.** The allowlist decides what WonderHome reads for the whole household — a privacy decision, not a personal preference — so it sits with the same people who hold the forwarding address and the AI key. Every member can read the list.

## What we match, and what we don't claim

We match the message's own `From`. An **auto-forward rule** preserves the original sender, which is what a household means when it approves `@school.edu`; the help copy tells people to set such a rule. A **manual** forward carries the forwarder as `From` — the honest limit of phase 1.

A `From` header can be forged. We therefore treat the match as the **gate, not verification**: the kept item still runs the ordinary HomeSend pipeline and waits for a person to confirm it (bills, receipts and health always wait), and all content is untrusted (`injection.ts`). We do **not** claim SPF/DKIM/ARC verification, because the provider's fetched-message schema does not expose authentication results reliably, and CLAUDE.md forbids claiming verification we don't have. Adding SPF/DKIM as a second signal — raising confidence, never lowering the confirmation bar — is a future refinement once the field is confirmed in the provider contract.

## Data minimisation and retention

Dropped mail is never stored — not as an item, not in logs with its content, only a counter. Processed mail becomes ordinary HomeSend items and follows the household's data-retention policy; this story adds no new retention path and does not touch the retention work in flight.
