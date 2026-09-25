# Get Help brought up to date

## What was done

The user guide at `/help` (`packages/core/src/help/guide.ts`) described the
product as it was months ago. It said, for example, that data export was not
built and that speech used only the browser. It is now rewritten against what
the screens do today. It has 25 sections, up from 16, and 17 common
questions, up from 10.

**New sections:**
- Language, region and formats;
- Voice and hands-free conversation;
- HomeSend;
- Reminders and notifications (replacing the old two lines);
- Health and fitness;
- Home and upkeep;
- Family, pets and family time;
- Household help;
- Your plan.

**Rewritten sections:**
- **HomeTalk.** Corrections, several requests in one sentence, reminders,
  edit and search.
- **Setting up your household.** The guided setup and the progress card.
- **Bills.** Transactions and per-record currency.
- **School.** Screenshot homework, and a child named on a notice.
- **Meals and groceries.** Receipts as purchase history, Suggest and
  preferences.
- **HomeBrain Review and asking "why?"**
- **Privacy.** Download a copy, deletion with a 30-day countdown, and what
  the assistant may share.
- **Connected accounts, WhatsApp and voice assistants.**

The questions the guide's search suggests now include HomeSend, language
and data export.

**Deliberately left out, at the owner's request:** anything platform-level.
The guide names no environment variable, provider credential, deployment,
server or database. Where something is not available yet, the guide says
so in a household's terms ("not available yet for your WonderHome"), the
same words the screens use.

The facts came from the screens' own code and copy, section by section.
Any claim that could not be confirmed there was softened or left out.

## Verified

- Help search tests pass (16/16). Every section id and every FAQ link is
  unique and resolves, and every section scores above the floor for its own
  title.
- Typecheck, lint, the secret lint and the unit suite (2903/2903) pass.
- In a browser, signed out, at 360px and 1280px:
  - all 25 sections render;
  - there is no horizontal overflow;
  - the question "how do I send a school notice?" was answered from the new
    FAQ, with a link to the HomeSend section.

## Still open

- The guide is English only. It moves to the catalog with the rest of 22-004.
- Whenever a feature changes what a household sees, its guide section
  should change with it.
