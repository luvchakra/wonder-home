import {
  AudioLines,
  BellRing,
  Camera,
  FileText,
  HandHeart,
  Heart,
  Languages,
  Link2,
  Mail,
  MessageCircle,
  Mic,
  Paperclip,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Undo2,
  Wallet,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";

import { LANGUAGES } from "@wonderhome/core/i18n/locales";
import { cn } from "@wonderhome/core/lib/cn";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";

/**
 * The landing page's newest chapters: what WonderHome learned to do most
 * recently, told the same way as the rest of the page.
 *
 * Honest by construction. Everything in "Ready today" works in the product as
 * shipped. What is built but waits on an account a person has to open —
 * WhatsApp, forwarded email, Alexa and Gemini voice, paying for a plan — says
 * "Coming soon" in words, never as a promise dressed as a feature. The
 * languages come from the product's own list, not from a marketing one.
 *
 * Motion is decoration only: parallax layers are `aria-hidden` and move on the
 * shared `Reveal` script, which does nothing under prefers-reduced-motion, and
 * every card is readable before its entrance has run.
 */

type Item = { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; copy: string };

const READY: Item[] = [
  {
    icon: Languages,
    tone: "ai",
    title: "Your home, in your language",
    copy: "HomeTalk, reminders and screens in English, हिन्दी, मराठी, Español, Français, Deutsch, العربية and 中文. Names, dates and amounts are never changed on the way.",
  },
  {
    icon: FileText,
    tone: "school",
    title: "Reads the whole document",
    copy: "Send a school circular and every date, fee and thing to bring becomes its own item — a moved date updates what's there, never a second copy.",
  },
  {
    icon: Undo2,
    tone: "primary",
    title: "Correct it like a person",
    copy: "“No, almond milk.” “Actually, make that Friday.” WonderHome swaps or undoes what it did, and keeps both steps on record.",
  },
  {
    icon: AudioLines,
    tone: "care",
    title: "Hands-free conversation",
    copy: "Talk back and forth while you cook. Pause, carry on, and nothing consequential happens without your yes.",
  },
  {
    icon: BellRing,
    tone: "attention",
    title: "Reminders that fit your day",
    copy: "Choose when each kind arrives, snooze with a tap, and get one summary of the day. A child's school things come as one nudge.",
  },
  {
    icon: HandHeart,
    tone: "people",
    title: "Covered when help is away",
    copy: "Mark a day off and WonderHome shows exactly what needs cover, so nothing quietly slips.",
  },
  {
    icon: Receipt,
    tone: "money",
    title: "Receipts become history",
    copy: "Snap a shop receipt and each item you keep joins its purchase history, so run-out dates get sharper.",
  },
  {
    icon: ShieldCheck,
    tone: "health",
    title: "Your data, your call",
    copy: "Download a copy of everything, or ask for it to be deleted — with 30 days to change your mind.",
  },
];

const SOON: Item[] = [
  { icon: MessageCircle, tone: "handled", title: "WhatsApp", copy: "Forward a message or a photo to WonderHome from the chat you already use." },
  { icon: Mail, tone: "primary", title: "Forwarded email", copy: "Your household's own address for school circulars and e-bills." },
  { icon: Mic, tone: "ai", title: "Alexa & Gemini voice", copy: "Ask from the kitchen, answered by the same WonderHome." },
  { icon: Wallet, tone: "money", title: "Pay your way", copy: "UPI, cards and netbanking in India; cards everywhere else." },
];

/** Soft, slow layers behind a section — decoration that drifts at its own depth. */
function Depth({ tone = "ai" }: { tone?: "ai" | "people" | "meals" }) {
  const colour = `var(--wh-tone-${tone}-soft)`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        data-parallax="0.18"
        className="absolute -top-24 -left-24 size-80 rounded-full opacity-80 blur-3xl"
        style={{ background: `radial-gradient(circle, ${colour} 0%, transparent 70%)` }}
      />
      <div
        data-parallax="-0.12"
        className="absolute top-1/3 -right-28 size-96 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--wh-primary-soft) 0%, transparent 70%)" }}
      />
      <div
        data-parallax="0.08"
        className="absolute -bottom-20 left-1/3 size-72 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--wh-tone-people-soft) 0%, transparent 70%)" }}
      />
      <Spark className="top-16 right-[18%]" parallax="0.3" delay="0s" />
      <Spark className="top-[46%] left-[8%]" parallax="0.22" delay="1.4s" heart />
      <Spark className="bottom-20 right-[12%]" parallax="0.35" delay="2.6s" />
    </div>
  );
}

function Spark({ className, parallax, delay, heart = false }: { className: string; parallax: string; delay: string; heart?: boolean }) {
  const Icon = heart ? Heart : Star;
  return (
    <span data-parallax={parallax} className={cn("absolute", className)}>
      <Icon
        className={cn("wh-twinkle size-5", heart ? "text-[var(--wh-tone-people)]" : "text-[var(--wh-tone-money)]")}
        style={{ "--wh-twinkle-delay": delay } as CSSProperties}
      />
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold tracking-[0.12em] text-[var(--wh-primary)] uppercase">{children}</p>;
}

/** What is new: the recent chapters, ready today, then what is on its way. */
export function WhatsNew() {
  return (
    <section id="new" className="relative overflow-hidden py-20 lg:py-28">
      <Depth />
      <div className="relative mx-auto max-w-[var(--wh-content-wide)] px-4 lg:px-8">
        <div className="wh-reveal mx-auto max-w-2xl text-center">
          <Eyebrow>New in WonderHome</Eyebrow>
          <h2 className="mt-3 text-[length:var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">
            Growing up alongside your family.
          </h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-[var(--wh-foreground-muted)]">
            The newest things WonderHome learned — each one a little less for someone at home to remember.
          </p>
        </div>

        <h3 className="wh-reveal mt-12 flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4 text-[var(--wh-primary)]" /> Ready today
        </h3>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {READY.map((item, index) => (
            <li
              key={item.title}
              className="wh-reveal wh-lift flex gap-3.5 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)] sm:block sm:p-5"
              style={{ "--wh-reveal-delay": `${(index % 4) * 70}ms` } as CSSProperties}
            >
              {/* Side by side on a phone, so eight cards read as a list, not a long scroll. */}
              <IconTile icon={item.icon} tone={item.tone} size="lg" />
              <span className="block min-w-0">
                <span className="block text-base font-semibold sm:mt-3">{item.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{item.copy}</span>
              </span>
            </li>
          ))}
        </ul>

        <h3 className="wh-reveal mt-12 text-sm font-semibold">Coming soon</h3>
        <p className="wh-reveal mt-1 text-sm text-[var(--wh-foreground-muted)]">
          Built and tested, and switched on as each service is connected.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SOON.map((item, index) => (
            <li
              key={item.title}
              className="wh-reveal flex gap-3 rounded-[var(--wh-radius)] border border-dashed border-[var(--wh-border-strong)] bg-[var(--wh-surface)]/70 p-4"
              style={{ "--wh-reveal-delay": `${index * 60}ms` } as CSSProperties}
            >
              <IconTile icon={item.icon} tone={item.tone} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {item.title}
                  <span className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                    Coming soon
                  </span>
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{item.copy}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type Arrival = { icon: ComponentType<{ className?: string }>; tone: IconTone; from: string; becomes: string; where: string };

const ARRIVALS: Arrival[] = [
  { icon: Camera, tone: "school", from: "Photo of a school notice", becomes: "Science fair · Friday", where: "Kids & School" },
  { icon: FileText, tone: "money", from: "Electricity bill.pdf", becomes: "Due on the 28th", where: "Bills" },
  { icon: Mic, tone: "care", from: "Voice note", becomes: "Milk, eggs and atta", where: "Groceries" },
  { icon: Link2, tone: "people", from: "A link from the swim club", becomes: "Saturday lessons, 8 AM", where: "Family time" },
];

/** HomeSend, told as a moment: things arrive, WonderHome reads them, a person says yes. */
export function SendItToWonderHome() {
  return (
    <section id="homesend" className="relative overflow-hidden py-20 lg:py-28" style={{ background: "var(--wh-gradient-hero)" }}>
      <LeafDecor corner="top-left" size={200} opacity={0.2} />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span data-parallax="0.25" className="absolute top-24 right-[10%] hidden sm:block">
          <IconTile icon={Camera} tone="school" size="lg" className="rotate-6 opacity-70 shadow-[var(--wh-shadow-card)]" />
        </span>
        <span data-parallax="0.4" className="absolute bottom-28 left-[6%] hidden sm:block">
          <IconTile icon={FileText} tone="money" className="-rotate-6 opacity-60 shadow-[var(--wh-shadow-card)]" />
        </span>
        <span data-parallax="-0.2" className="absolute top-[40%] right-[42%] hidden lg:block">
          <IconTile icon={Mic} tone="care" className="rotate-3 opacity-50" />
        </span>
      </div>

      <div className="relative mx-auto grid max-w-[var(--wh-content-wide)] items-center gap-12 px-4 lg:grid-cols-2 lg:px-8">
        <div className="wh-reveal">
          <Eyebrow>HomeSend</Eyebrow>
          <h2 className="mt-3 text-[length:var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">
            Snap it. Send it. Done.
          </h2>
          <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-[var(--wh-foreground-muted)]">
            The fridge-door notice, the bill in your inbox, the list you said out loud in the car. Send it to WonderHome from the app or your phone&apos;s share button, and it lands in the right place.
          </p>
          <ol className="mt-8 space-y-4">
            {[
              { title: "Send", copy: "A photo, a PDF, a link, a voice note or a pasted message." },
              { title: "WonderHome reads it", copy: "Who it's for, what it is, and when — checked against what's already on record." },
              { title: "You say yes", copy: "Nothing is added until someone confirms, and anything added can be undone." },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--wh-primary)] text-xs font-bold text-[var(--wh-primary-foreground)]">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{step.copy}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* The inbox, drawn with the product's own row shape. Illustrative content. */}
        <div className="wh-reveal relative" data-parallax="-0.05" style={{ "--wh-reveal-delay": "120ms" } as CSSProperties}>
          <div className="rounded-[var(--wh-radius-lg)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-raised)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--wh-border)] pb-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Paperclip aria-hidden className="size-4 text-[var(--wh-primary)]" /> HomeSend inbox
              </p>
              <span className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-attention-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--wh-attention)]">
                4 waiting for you
              </span>
            </div>
            <ul className="mt-2 divide-y divide-[var(--wh-border)]">
              {ARRIVALS.map((item, index) => (
                <li key={item.from} className="wh-arrive flex items-start gap-3 py-3" style={{ "--wh-arrive-delay": `${300 + index * 260}ms` } as CSSProperties}>
                  <IconTile icon={item.icon} tone={item.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-[var(--wh-foreground-subtle)]">{item.from}</span>
                    <span className="block text-sm font-semibold">{item.becomes}</span>
                    <span className="block text-xs text-[var(--wh-foreground-muted)]">Goes to {item.where}</span>
                  </span>
                  <span className="shrink-0 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--wh-primary)]">
                    Confirm
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-center text-xs text-[var(--wh-foreground-subtle)]">An illustrative household.</p>
        </div>
      </div>
    </section>
  );
}

/** Greetings in every language WonderHome speaks, from the product's own list. */
export function LanguageStrip() {
  const greetings = LANGUAGES.map((language) => ({ code: language.code, text: language.greeting, name: language.nativeName, dir: language.dir }));
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {greetings.map((greeting) => (
        <li
          key={`${hidden ? "b" : "a"}-${greeting.code}`}
          lang={greeting.code}
          dir={greeting.dir}
          className="flex items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 py-2 text-sm whitespace-nowrap shadow-[var(--wh-shadow-card)]"
        >
          <span className="font-semibold">{greeting.text}</span>
          <span className="text-xs text-[var(--wh-foreground-subtle)]">{greeting.name}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label="Languages WonderHome speaks" className="relative overflow-hidden border-y border-[var(--wh-border)] bg-[var(--wh-surface)]/50 py-6">
      <p className="mx-auto mb-4 max-w-[var(--wh-content-wide)] px-4 text-center text-xs font-semibold tracking-wide text-[var(--wh-foreground-muted)] uppercase lg:px-8">
        Your home, in your words
      </p>
      <div className="relative">
        <div className="wh-marquee">
          {row(false)}
          {row(true)}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[var(--wh-background)] to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--wh-background)] to-transparent" />
      </div>
    </section>
  );
}
