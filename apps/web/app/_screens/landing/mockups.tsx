import {
  CalendarHeart,
  CircleCheck,
  GraduationCap,
  Mic,
  ShoppingBasket,
  Sparkles,
  Utensils,
  Wallet,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@wonderhome/core/lib/cn";
import { AiOrb } from "@wonderhome/core/ui/ai-message";
import { BrandMark } from "@wonderhome/core/ui/brand";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";

/**
 * Product visuals for the landing page, rendered from the real components
 * rather than screenshots (requirements §32): they never go stale, never
 * stretch, and always match the product's current design.
 *
 * The content is illustrative and labelled as such where a reader could take
 * it for their own data.
 */
export function PhoneFrame({ children, className, tilt = 0 }: { children: ReactNode; className?: string; tilt?: number }) {
  return (
    <div
      aria-hidden
      className={cn("relative w-[15.5rem] rounded-[2.4rem] border-[6px] border-[oklch(0.2_0.02_255)] bg-[var(--wh-background)] shadow-[var(--wh-shadow-float)]", className)}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <div className="absolute top-2 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-[oklch(0.2_0.02_255)]" />
      <div className="overflow-hidden rounded-[2rem] pt-8 pb-4">{children}</div>
    </div>
  );
}

export function LaptopFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("relative", className)}>
      <div className="rounded-t-[1.25rem] border-[8px] border-b-0 border-[oklch(0.2_0.02_255)] bg-[var(--wh-background)] shadow-[var(--wh-shadow-float)]">
        <div className="overflow-hidden rounded-t-[0.75rem]">{children}</div>
      </div>
      <div className="h-3 rounded-b-[1rem] bg-[oklch(0.3_0.02_255)]" />
      <div className="mx-auto h-1.5 w-1/3 rounded-b-md bg-[oklch(0.25_0.02_255)]" />
    </div>
  );
}

/** The Home dashboard, as a phone. */
export function DashboardMock() {
  return (
    <div className="space-y-3 px-3 text-[var(--wh-foreground)]">
      <div>
        <p className="text-[0.9375rem] font-bold tracking-tight">Good morning, Kunal! 👋</p>
        <p className="text-[0.625rem] text-[var(--wh-foreground-muted)]">A calmer home today.</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["3", "Need you", "text-[var(--wh-attention)]"],
          ["12", "Handled", "text-[var(--wh-handled)]"],
          ["0", "Urgent", "text-[var(--wh-foreground-subtle)]"],
        ].map(([value, label, tone]) => (
          <div key={label} className="rounded-xl border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1.5 text-center">
            <p className={cn("text-sm font-bold leading-none", tone)}>{value}</p>
            <p className="mt-0.5 text-[0.5625rem] text-[var(--wh-foreground-subtle)]">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-[0.6875rem] font-semibold">Needs you</p>
      <ul className="space-y-1.5">
        <MockRow icon={Wallet} tone="money" title="Electricity bill" meta="Due tomorrow · ₹2,840" action="Pay" primary />
        <MockRow icon={GraduationCap} tone="school" title="Anaya's science project" meta="60% complete" action="Review" />
        <MockRow icon={ShoppingBasket} tone="care" title="Grocery order" meta="7 items · arriving 11 AM" action="Track" />
      </ul>
      <p className="text-[0.6875rem] font-semibold">WonderHome handled</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {["Dinner plan ready", "Karate class confirmed"].map((item) => (
          <li key={item} className="flex items-center gap-1.5 rounded-lg bg-[var(--wh-handled-soft)] px-2 py-1.5 text-[0.625rem] font-medium">
            <CircleCheck className="size-3 shrink-0 text-[var(--wh-handled)]" /> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The AI assistant, as a phone. */
export function AssistantMock() {
  return (
    <div className="flex h-full flex-col px-3 text-[var(--wh-foreground)]">
      <div className="flex items-center gap-2">
        <BrandMark size={18} />
        <div>
          <p className="text-[0.75rem] font-bold">WonderHome AI</p>
          <p className="text-[0.5625rem] text-[var(--wh-foreground-muted)]">Always here for your family</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center">
        <AiOrb size={44} />
        <p className="mt-2 text-[0.8125rem] font-semibold">Hi Kunal! 👋</p>
        <p className="text-[0.625rem] text-[var(--wh-foreground-muted)]">How can I help you today?</p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {[
          [CalendarHeart, "people", "Plan a family outing this weekend"],
          [ShoppingBasket, "care", "Add milk to grocery list"],
          [GraduationCap, "school", "What's on Anaya's calendar?"],
          [Utensils, "meals", "Suggest a healthy dinner recipe"],
        ].map(([Icon, tone, text]) => (
          <li key={text as string} className="flex items-center gap-2 rounded-xl border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2.5 py-1.5 text-[0.625rem] font-medium">
            <IconTile icon={Icon as ComponentType<{ className?: string }>} tone={tone as IconTone} size="sm" className="size-6 [&_svg]:size-3" />
            {text as string}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col items-center">
        <span className="grid size-11 place-items-center rounded-full text-white shadow-[var(--wh-shadow-primary)]" style={{ background: "var(--wh-gradient-primary)" }}>
          <Mic className="size-5" />
        </span>
        <p className="mt-1 text-[0.5625rem] text-[var(--wh-foreground-muted)]">Tap to speak</p>
      </div>
      <div className="mt-3 flex items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-1.5 text-[0.625rem] text-[var(--wh-foreground-subtle)]">
        Type a message…
      </div>
    </div>
  );
}

/** The desktop dashboard, as a laptop. */
export function DesktopMock() {
  return (
    <div className="flex bg-[var(--wh-background)] text-[var(--wh-foreground)]">
      <div className="hidden w-32 shrink-0 space-y-1 border-r border-[var(--wh-border)] bg-[var(--wh-surface)]/70 p-3 sm:block">
        <div className="mb-3 flex items-center gap-1.5">
          <BrandMark size={16} />
          <span className="text-[0.625rem] font-bold">WonderHome</span>
        </div>
        {["Home", "Today", "Family", "School", "Groceries", "Meals", "Bills", "Househelper"].map((item, index) => (
          <p key={item} className={cn("rounded-md px-2 py-1 text-[0.5625rem] font-medium", index === 0 ? "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]" : "text-[var(--wh-foreground-muted)]")}>
            {item}
          </p>
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] font-bold">Good morning, Kunal! 👋</p>
          <span className="rounded-full bg-[var(--wh-surface)] px-2 py-0.5 text-[0.5625rem] font-medium">Tue, 16 Sep</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[["3", "Need attention", "text-[var(--wh-attention)]"], ["12", "In progress", "text-[var(--wh-info)]"], ["2", "Completed", "text-[var(--wh-handled)]"], ["1", "Overdue", "text-[var(--wh-risk)]"]].map(([value, label, tone]) => (
            <div key={label} className="rounded-lg border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1.5">
              <p className={cn("text-xs font-bold leading-none", tone)}>{value}</p>
              <p className="mt-0.5 text-[0.5rem] text-[var(--wh-foreground-subtle)]">{label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <div className="space-y-1.5">
            <p className="text-[0.625rem] font-semibold">Today&apos;s priorities</p>
            <MockRow icon={Wallet} tone="money" title="Electricity bill" meta="Due today · ₹2,840" action="Pay" primary />
            <MockRow icon={GraduationCap} tone="school" title="Anaya's science project" meta="60% complete" action="Review" />
            <MockRow icon={Utensils} tone="meals" title="Dinner — Paneer pulao" meta="Ready by 8 PM" action="Recipe" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[0.625rem] font-semibold">Family moment</p>
            <div className="h-14 rounded-lg" style={{ background: "var(--wh-gradient-sunset)" }} />
            <p className="text-[0.5625rem] font-medium">Nature park outing · Sunday 3 PM</p>
            <p className="rounded-lg bg-[var(--wh-primary-soft)] px-2 py-1 text-[0.5625rem] font-medium text-[var(--wh-primary)] italic">
              More family time. Brighter tomorrow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockRow({ icon, tone, title, meta, action, primary = false }: { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; action: string; primary?: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1.5">
      <IconTile icon={icon} tone={tone} size="sm" className="size-7 [&_svg]:size-3.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.6875rem] font-semibold">{title}</span>
        <span className="block truncate text-[0.5625rem] text-[var(--wh-foreground-subtle)]">{meta}</span>
      </span>
      <span className={cn("rounded-full px-2 py-0.5 text-[0.5625rem] font-bold", primary ? "bg-[var(--wh-primary)] text-white" : "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]")}>
        {action}
      </span>
    </li>
  );
}

/** Small floating product cards for the hero. */
export function FloatingCard({ icon, tone, title, meta, className, delay = "0s", tilt = "0deg" }: { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; className?: string; delay?: string; tilt?: string }) {
  return (
    <div
      aria-hidden
      className={cn("wh-float flex items-center gap-2.5 rounded-2xl border border-[var(--wh-border)] bg-[var(--wh-surface)]/95 px-3 py-2.5 shadow-[var(--wh-shadow-raised)] backdrop-blur", className)}
      style={{ "--wh-float-delay": delay, "--wh-float-tilt": tilt } as React.CSSProperties}
    >
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{title}</span>
        <span className="block truncate text-[0.6875rem] text-[var(--wh-foreground-muted)]">{meta}</span>
      </span>
    </div>
  );
}

export const HERO_ICONS = { Sparkles };
