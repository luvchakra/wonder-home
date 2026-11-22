# 2026-11-22 Home hero: the cat's bubble gets its own place on desktop

**Why.** The owner, 2026-11-22: "doesnt look good on desktop, align it nicely".
On a desktop the cat's thought bubble ("Meow! 29 things on the list to buy.")
sat on the handwritten line ("Happy homes / Happier Humans!") and over the
mug, and "Today's plan →" was clipped. The bubble was placed by script
(`follow` in `cat-thought-bubble.tsx`), which looked for the cat's head inside
the scene and ignored the handwritten line; the line itself was pinned at
`start-[40%] bottom-6`, where the scene's cat is.

**What changed.** From `sm` the header is a two-column grid
(`home-dashboard.tsx`): the greeting and the handwritten line close the start
column; the date card (`today-card.tsx`, now in the grid, not absolute) and
the cat with its bubble (`HeroCatFigure`) hold the end column. The cat is
drawn whole by `HeroCat` at every width, so the scene leaves its own cat out
on Home (`CozyCornerIllustration cat={false}`; onboarding keeps it). The bubble
sits beside the cat and its trail points at it (`trail="beside"`: end side on
a phone, start side from `sm`). The script placement (`follow`) is gone. A
longer language only makes the row taller; nothing can overlap. Phone layout
is unchanged.

**Verified.** The hero rendered in isolation (a temporary unsigned route, not
committed; no `.env.local` in the container to sign in) and measured with
Playwright at 360, 768, 1024, 1280, 1440 and 1920 px, beside a 16rem sidebar
from 1024, in all eight languages with a short and a long bubble, Arabic
right to left: 0 of 96 cases with overlap between bubble, cat, handwritten
line, date card and greeting; nothing outside the header; no horizontal
scroll. The short line wraps to two lines at every width. Typecheck and lint
clean.

**Cleanup.** No QA accounts or data created; the preview route and dev server
were removed.
