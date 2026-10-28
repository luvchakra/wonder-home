# UI simplification, part 3: one Connections page (00-015)

**Date:** 2026-10-28 · **Design:** `design/UI-SIMPLIFICATION-v1.md` M2

## What was done
- **Settings → Connections** (`/settings/connections`) replaces five pages. Each old page is now a section, and its old address redirects to the section's anchor:
  - **WhatsApp** (`#whatsapp`)
  - **Voice assistants** (`#voice`)
  - **Connect school** (`#school`)
  - **Websites and services** (`#accounts`, the household's named connections)
  - **Providers**, devices, weather and partner keys (the old Integrations page)
- Each section keeps its own rules:
  - A person sees their own WhatsApp and voice links; an Admin sees everyone's.
  - Every member sees the named connections, and adults change them.
  - School, providers, devices, weather and partner keys show only with `integrations.manage`.
- **Shopping:** Swiggy Instamart shows whether it is connected and leads to the order page. Connecting stays beside ordering (decided while building).
- **Settings:** the WhatsApp, Voice assistants, Swiggy Instamart and Connected accounts rows become one **Connections** row.
- **Elsewhere:** every link, server-action revalidation, HomeTalk place and HomeBrain "say" link now points at the new page.
- **Help:** the guide is updated in all eight languages: Settings → Connections (→ WhatsApp / Voice assistants), and Kids & School's "open Settings → Connections and tap School".

## Verified
- Typecheck and lint pass; 1382 unit tests pass; `lint:help-links` passes; the production build passes.
- Browser check on a QA household on the live project, at 360 px and 1280 px, with no overflow:
  - The sections render in order.
  - Settings shows one Connections row.
  - All five old URLs return 308 to their anchors.

## Open
- 00-016: Settings with You and Household tabs, and one setup wizard.
