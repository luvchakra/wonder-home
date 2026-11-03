# Settings: Assistant & voice card starts collapsed

Owner request: the "Assistant & voice" card opened expanded (set in #464); it now starts closed like the other Settings cards.

- `apps/web/app/settings/page.tsx`: dropped `defaultOpen`; gave the card `id="assistant"` so `#assistant` deep links open it through `OpenOnHash` (it opens every containing `<details>`).
- `settingsHome.ai.meta` reworded in all eight languages from "{source} · household key and data use" to "{source} · data use", so "household key" is not said twice.
- Verified: typecheck and i18n tests (see PR). Needs a person: open Settings and check the card is closed.
