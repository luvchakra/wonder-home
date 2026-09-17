import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Brain,
  CalendarHeart,
  CircleCheck,
  Clock3,
  Eye,
  GraduationCap,
  HandHeart,
  Heart,
  Laptop,
  Leaf,
  ListChecks,
  Lock,
  Play,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

import { FEATURES } from "@wonderhome/core/billing/entitlements";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { cn } from "@wonderhome/core/lib/cn";
import { BrandMark, Wordmark } from "@wonderhome/core/ui/brand";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { DomainCard, DomainGrid } from "@wonderhome/core/ui/domain-card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";

import { HomeIllustration } from "../_components/home-illustration";
import { LandingHeader } from "./landing/header";
import { AssistantMock, DashboardMock, DesktopMock, FloatingCard, LaptopFrame, PhoneFrame } from "./landing/mockups";
import { Reveal } from "./landing/reveal";

/**
 * The landing page (requirements §25–§45): one page, Apple-style storytelling
 * in WonderHome's own design. It shares the product's tokens, mark, buttons,
 * cards and iconography, and its product visuals are the real components.
 *
 * Nothing on it is fabricated: testimonials are marked illustrative, pricing
 * comes from the plan catalogue and carries no prices because none are
 * configured, and the security section claims only what the codebase does.
 */
type Plan = { key: string; name: string; description: string | null; features: string[] };

const PLAN_TAGLINE: Record<string, string> = {
  free: "Run the Home",
  pro: "Let WonderHome Think",
  max: "Let WonderHome Run the Home",
};

async function loadPlans(): Promise<Plan[]> {
  try {
    const admin = createAdminClient();
    const [{ data: plans }, { data: features }] = await Promise.all([
      admin.from("plans").select("key, name, description, sort_order").eq("active", true).order("sort_order"),
      admin.from("plan_features").select("plan_key, feature_key, enabled").eq("enabled", true),
    ]);
    return ((plans as { key: string; name: string; description: string | null }[] | null) ?? []).map((plan) => ({
      key: plan.key,
      name: plan.name,
      description: plan.description,
      features: ((features as { plan_key: string; feature_key: string }[] | null) ?? [])
        .filter((feature) => feature.plan_key === plan.key)
        .map((feature) => FEATURES[feature.feature_key as keyof typeof FEATURES] ?? feature.feature_key),
    }));
  } catch {
    // No catalogue reachable: show the plans without their feature lists
    // rather than inventing them.
    return [
      { key: "free", name: "Free", description: "The household basics, with WonderHome watching quietly.", features: [] },
      { key: "pro", name: "Pro", description: "The full household: school, commerce, meals, bills and family time.", features: [] },
      { key: "max", name: "Max", description: "Everything, with autonomous action and deeper integrations.", features: [] },
    ];
  }
}

export async function Landing() {
  const plans = await loadPlans();

  return (
    <div id="top" className="min-h-dvh overflow-x-clip text-[var(--wh-foreground)]">
      <a href="#wh-main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--wh-radius-sm)] focus:bg-[var(--wh-surface)] focus:px-4 focus:py-2 focus:shadow-[var(--wh-shadow-card)]">
        Skip to main content
      </a>
      <Reveal />
      <LandingHeader />

      <main id="wh-main">
        {/* Hero */}
        <section className="relative overflow-hidden" style={{ background: "var(--wh-gradient-hero)" }}>
          <div className="mx-auto grid max-w-[var(--wh-content-wide)] items-center gap-10 px-4 pt-12 pb-16 lg:grid-cols-[1fr_1.1fr] lg:px-8 lg:pt-20 lg:pb-28">
            <div className="wh-rise max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)]/80 px-3 py-1 text-xs font-semibold text-[var(--wh-primary)]">
                <Leaf aria-hidden className="size-3.5" /> A calmer home is possible
              </span>
              <h1 className="mt-5 text-[var(--wh-text-hero)] leading-[0.98] font-bold tracking-[-0.03em] text-balance">
                Home runs smoother.
                <br />
                <span className="text-[var(--wh-primary)]">Together.</span>
              </h1>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--wh-foreground-muted)]">
                WonderHome helps your family stay organized, reduce mental load, and focus on what truly matters — more time together.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/sign-up" className="min-h-12 rounded-[var(--wh-radius-pill)] px-6 text-base shadow-[var(--wh-shadow-primary)]">
                  Get Started Free <ArrowRight aria-hidden className="size-4" />
                </ButtonLink>
                <ButtonLink href="#solution" variant="secondary" className="min-h-12 rounded-[var(--wh-radius-pill)] px-6 text-base">
                  <Play aria-hidden className="size-4" /> See how it works
                </ButtonLink>
              </div>
              <p className="mt-4 text-xs text-[var(--wh-foreground-subtle)]">
                No credit card required · Works on all your devices · Made for families
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none" data-parallax="-0.04">
              <HomeIllustration className="wh-rise w-full" />
              <FloatingCard icon={Utensils} tone="meals" title="Dinner plan ready" meta="Paneer pulao · view recipe" className="absolute -top-2 right-0 w-52 sm:right-6" delay="0.3s" tilt="2deg" />
              <FloatingCard icon={GraduationCap} tone="school" title="Homework done" meta="2 tasks completed · great job!" className="absolute top-1/3 -left-2 w-52 sm:left-0" delay="1.1s" tilt="-2deg" />
              <FloatingCard icon={ShoppingBasket} tone="care" title="Grocery order delivered" meta="7 items · ₹1,840" className="absolute right-2 bottom-6 w-56 sm:right-10" delay="0.7s" tilt="1.5deg" />
              <FloatingCard icon={Wallet} tone="money" title="Electricity bill" meta="Due tomorrow · reminder handled" className="absolute -bottom-3 left-4 w-56 sm:left-10" delay="1.6s" tilt="-1deg" />
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section aria-label="Trusted by families" className="border-y border-[var(--wh-border)] bg-[var(--wh-surface)]/60">
          <div className="mx-auto flex max-w-[var(--wh-content-wide)] flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-[var(--wh-foreground-muted)] sm:flex-row lg:px-8">
            <p className="flex items-center gap-2 font-medium"><Smartphone aria-hidden className="size-4" /> iPhone · Android · Web — install it like an app</p>
            <p className="flex items-center gap-2 font-medium"><Lock aria-hidden className="size-4" /> Private by default. Your household is never training data.</p>
            <p className="flex items-center gap-2 font-medium"><Heart aria-hidden className="size-4 text-[var(--wh-tone-people)]" /> Built for families, not for chores</p>
          </div>
        </section>

        {/* Problem */}
        <Section id="why" eyebrow="The problem" title={<>Modern life is beautiful.<br />But it&apos;s a lot.</>} lede="Between work, school, chores, bills, meals, shopping and a million little things, household management can become overwhelming. The mental load of running a home shouldn't rest on one person.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Brain, tone: "school", title: "Too much to remember", copy: "Tasks, schedules, bills, shopping and school information never end." },
              { icon: Users, tone: "people", title: "Hard to stay aligned", copy: "Everyone is busy. Things slip. Conversations get missed." },
              { icon: Clock3, tone: "money", title: "Decisions are tiring", copy: "What to cook? What to buy? What needs attention now?" },
              { icon: Heart, tone: "care", title: "Less time together", copy: "The management of life can consume the life itself." },
            ].map((item, index) => (
              <StoryCard key={item.title} index={index} {...item} tone={item.tone as IconTone} />
            ))}
          </div>
        </Section>

        {/* Solution */}
        <section id="solution" className="relative overflow-hidden py-20 lg:py-28">
          <div className="mx-auto grid max-w-[var(--wh-content-wide)] items-center gap-12 px-4 lg:grid-cols-2 lg:px-8">
            <div className="wh-reveal">
              <Eyebrow>The solution</Eyebrow>
              <h2 className="mt-3 text-[var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">
                Meet <span className="text-[var(--wh-primary)]">WonderHome.</span>
              </h2>
              <p className="mt-2 text-xl font-semibold tracking-tight">Your AI partner for a happier home.</p>
              <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-[var(--wh-foreground-muted)]">
                WonderHome brings everything your family needs into one simple, beautiful app. It helps you plan, coordinate, simplify and act — so you can spend less time managing, and more time living.
              </p>
              <blockquote className="mt-6 rounded-[var(--wh-radius)] border-l-4 border-[var(--wh-primary)] bg-[var(--wh-primary-soft)]/60 px-5 py-4 text-[0.9375rem] font-medium">
                WonderHome doesn&apos;t give your family more things to manage. It manages the management.
              </blockquote>
              <ul className="mt-8 grid grid-cols-5 gap-2 text-center">
                {[
                  { icon: ListChecks, label: "Plan", tone: "people" },
                  { icon: Users, label: "Coordinate", tone: "care" },
                  { icon: Leaf, label: "Simplify", tone: "money" },
                  { icon: Sparkles, label: "Act", tone: "ai" },
                  { icon: Brain, label: "Learn", tone: "school" },
                ].map((item) => (
                  <li key={item.label} className="flex flex-col items-center gap-2">
                    <IconTile icon={item.icon} tone={item.tone as IconTone} size="lg" className="rounded-full" />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink href="/sign-up" className="mt-8 min-h-12 rounded-[var(--wh-radius-pill)] px-6">
                Get Started Free <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <p className="mt-3 text-xs text-[var(--wh-foreground-subtle)]">A brighter tomorrow starts at home.</p>
            </div>

            <div className="wh-reveal relative mx-auto flex justify-center" style={{ "--wh-reveal-delay": "120ms" } as React.CSSProperties} data-parallax="-0.06">
              <div className="absolute inset-0 -z-10 rounded-full blur-3xl" style={{ background: "var(--wh-gradient-hero)" }} aria-hidden />
              <PhoneFrame tilt={-4} className="wh-float">
                <DashboardMock />
              </PhoneFrame>
              <FloatingCard icon={CalendarHeart} tone="people" title="Family outing" meta="Sunday · 3–7 PM · protected" className="absolute -right-2 top-10 w-48 sm:right-0" delay="0.9s" tilt="3deg" />
              <FloatingCard icon={CircleCheck} tone="handled" title="Class confirmed" meta="Karate · Thursday 6:30 PM" className="absolute bottom-16 -left-2 w-48 sm:left-0" delay="1.8s" tilt="-3deg" />
            </div>
          </div>
        </section>

        {/* Features */}
        <Section id="features" eyebrow="Everything your home needs" title="In one place." lede="Powerful features for real life. Each one is a household outcome — not another list to maintain.">
          <DomainGrid className="lg:grid-cols-5">
            {[
              { icon: Users, tone: "people", title: "Family & Profiles", description: "Everyone together. Without the coordination headache." },
              { icon: Clock3, tone: "primary", title: "Today", description: "Your day. Your focus." },
              { icon: ListChecks, tone: "home", title: "Responsibilities", description: "Clear roles. A smoother home." },
              { icon: Utensils, tone: "meals", title: "Meals & Recipes", description: "Healthy meals. Happier moods." },
              { icon: ShoppingBasket, tone: "care", title: "Groceries", description: "Never run out again." },
              { icon: Wallet, tone: "money", title: "Bills & Finance", description: "Stay on top. Stress less." },
              { icon: GraduationCap, tone: "school", title: "Kids & School", description: "All school info in one place." },
              { icon: HandHeart, tone: "people", title: "Househelper", description: "Support that keeps home running." },
              { icon: BadgeCheck, tone: "ai", title: "Certification", description: "Your home, understood." },
              { icon: Sparkles, tone: "ai", title: "AI Assistant", description: "Always here for your family." },
            ].map((item, index) => (
              <div key={item.title} className="wh-reveal" style={{ "--wh-reveal-delay": `${index * 50}ms` } as React.CSSProperties}>
                <DomainCard icon={item.icon} tone={item.tone as IconTone} title={item.title} description={item.description} className="h-full" />
              </div>
            ))}
          </DomainGrid>
        </Section>

        {/* AI story */}
        <section id="families" className="py-20 lg:py-28" style={{ background: "var(--wh-gradient-hero)" }}>
          <div className="mx-auto grid max-w-[var(--wh-content-wide)] items-center gap-12 px-4 lg:grid-cols-[1fr_1.1fr] lg:px-8">
            <div className="wh-reveal order-2 mx-auto flex justify-center lg:order-1" data-parallax="-0.05">
              <PhoneFrame tilt={3} className="wh-float" >
                <AssistantMock />
              </PhoneFrame>
            </div>
            <div className="wh-reveal order-1 lg:order-2">
              <Eyebrow>Talk to your home</Eyebrow>
              <h2 className="mt-3 text-[var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">
                You don&apos;t have to tell WonderHome everything. It learns the rhythm of your home.
              </h2>
              <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-[var(--wh-foreground-muted)]">
                Say it or type it — &ldquo;Plan a family outing this weekend&rdquo; — and WonderHome checks availability, preferences and what&apos;s already planned, then shows you exactly what it would do before it does it.
              </p>
              <ol className="mt-8 flex flex-wrap items-center gap-2 text-xs font-semibold">
                {["Observe", "Understand", "Plan", "Act", "Monitor", "Result", "Learn"].map((step, index, all) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-1.5">{step}</span>
                    {index < all.length - 1 ? <ArrowRight aria-hidden className="size-3.5 text-[var(--wh-foreground-subtle)]" /> : null}
                  </li>
                ))}
              </ol>
              <ul className="mt-8 space-y-3">
                {[
                  { icon: Eye, text: "Every consequential action shows what it understood, what it plans, and the impact — with Confirm, Change and Cancel." },
                  { icon: ShieldCheck, text: "Payments, deletions and access changes always ask. Autonomy is set by your household, per responsibility." },
                  { icon: Bell, text: "Notifications are sparse, threaded and resolve themselves when the situation does." },
                ].map((item) => (
                  <li key={item.text} className="flex gap-3 text-sm text-[var(--wh-foreground-muted)]">
                    <item.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-primary)]" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Cross-device */}
        <section className="overflow-hidden py-20 lg:py-28">
          <div className="mx-auto grid max-w-[var(--wh-content-wide)] items-center gap-12 px-4 lg:grid-cols-[1.3fr_1fr] lg:px-8">
            <div className="wh-reveal relative min-w-0" data-parallax="-0.04">
              <LaptopFrame className="w-full max-w-2xl">
                <DesktopMock />
              </LaptopFrame>
              <PhoneFrame tilt={6} className="absolute -right-2 -bottom-6 hidden w-40 scale-[0.62] sm:block lg:right-0">
                <AssistantMock />
              </PhoneFrame>
            </div>
            <div className="wh-reveal">
              <Eyebrow>Beautiful. On all your devices.</Eyebrow>
              <h2 className="mt-3 text-[var(--wh-text-display)] leading-[1.05] font-bold tracking-tight">
                At home.<br />On the go.<br />Always with you.
              </h2>
              <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-[var(--wh-foreground-muted)]">
                WonderHome works seamlessly across mobile, tablet and desktop, keeping your home in sync wherever life takes you.
              </p>
              <ul className="mt-6 flex gap-5 text-sm font-medium text-[var(--wh-foreground-muted)]">
                <li className="flex items-center gap-2"><Smartphone aria-hidden className="size-4" /> iOS &amp; Android</li>
                <li className="flex items-center gap-2"><Laptop aria-hidden className="size-4" /> Web</li>
              </ul>
              <ButtonLink href="/sign-up" className="mt-8 min-h-12 rounded-[var(--wh-radius-pill)] px-6">
                See it in action <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Security */}
        <Section id="security" eyebrow="Privacy & security" title={<>Your home is private.<br />So is your life.</>} lede="WonderHome is built so that the only people who can see your household are the people in it.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Lock, title: "Secure sign-in", copy: "Sessions verified server-side on every request. Sensitive actions ask you to confirm again." },
              { icon: ShieldCheck, title: "Tenant isolation", copy: "Every row is scoped to your household and enforced in the database, not just the app." },
              { icon: Users, title: "Child privacy", copy: "Children get age-appropriate views. Money, admin and adult conversations never reach them." },
              { icon: Eye, title: "Audited & governed", copy: "AI acts only through governed tools. Sensitive actions are logged, never model-decided." },
            ].map((item, index) => (
              <div key={item.title} className="wh-reveal rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-5 shadow-[var(--wh-shadow-card)]" style={{ "--wh-reveal-delay": `${index * 70}ms` } as React.CSSProperties}>
                <IconTile icon={item.icon} tone="primary" size="lg" />
                <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{item.copy}</p>
              </div>
            ))}
          </div>
          <p className="wh-reveal mt-6 text-center text-xs text-[var(--wh-foreground-subtle)]">
            Household data is not used to train models by default. Integrations are connected only with your consent and only for what they need.
          </p>
        </Section>

        {/* Stories */}
        <Section id="stories" eyebrow="Real families. Real happier homes." title="What a calmer home feels like." lede="Stories from families will appear here as WonderHome reaches them. The cards below are illustrative — written to show the format, not quoted from anyone.">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { name: "Priya S.", city: "Mumbai", quote: "The mental load isn't only mine anymore. The house tells us what needs us — and stays quiet about the rest." },
              { name: "Rahul M.", city: "Bengaluru", quote: "School, meals, bills — one place, and it asks before it acts. That's the part that made me trust it." },
              { name: "Anita K.", city: "Pune", quote: "Sunday afternoons are protected now. Nothing gets scheduled over them, and that alone was worth it." },
            ].map((story, index) => (
              <figure key={story.name} className="wh-reveal relative rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-5 shadow-[var(--wh-shadow-card)]" style={{ "--wh-reveal-delay": `${index * 80}ms` } as React.CSSProperties}>
                <span className="absolute top-3 right-3 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                  Illustrative
                </span>
                <blockquote className="pr-16 text-[0.9375rem] leading-relaxed">&ldquo;{story.quote}&rdquo;</blockquote>
                <figcaption className="mt-4 flex items-center gap-2 text-xs text-[var(--wh-foreground-muted)]">
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--wh-tone-people-soft)] text-[0.6875rem] font-bold text-[var(--wh-tone-people)]">{story.name.slice(0, 1)}</span>
                  <span><span className="font-semibold text-[var(--wh-foreground)]">{story.name}</span> · {story.city}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        {/* Pricing */}
        <Section id="pricing" eyebrow="Pricing" title="Start free. Grow into it." lede="Three plans, from a quiet watcher to a home that runs itself. Plan details come from WonderHome's live catalogue.">
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan, index) => {
              const highlighted = plan.key === "pro";
              return (
                <div
                  key={plan.key}
                  className={cn(
                    "wh-reveal flex flex-col rounded-[var(--wh-radius-lg)] border bg-[var(--wh-surface)] p-6 shadow-[var(--wh-shadow-card)]",
                    highlighted ? "border-[var(--wh-primary)] shadow-[var(--wh-shadow-raised)] ring-1 ring-[var(--wh-primary)]" : "border-[var(--wh-border)]",
                  )}
                  style={{ "--wh-reveal-delay": `${index * 80}ms` } as React.CSSProperties}
                >
                  {highlighted ? <span className="mb-3 inline-flex w-fit rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] px-2.5 py-1 text-[0.625rem] font-bold tracking-wide text-[var(--wh-primary-foreground)] uppercase">Most families</span> : null}
                  <h3 className="text-2xl font-bold tracking-tight">{plan.name}</h3>
                  <p className="text-sm font-semibold text-[var(--wh-primary)]">{PLAN_TAGLINE[plan.key] ?? ""}</p>
                  <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">{plan.description}</p>
                  {plan.features.length > 0 ? (
                    <ul className="mt-5 space-y-2 text-sm">
                      {plan.features.slice(0, 8).map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-handled)]" />
                          {feature}
                        </li>
                      ))}
                      {plan.features.length > 8 ? <li className="text-xs text-[var(--wh-foreground-subtle)]">and {plan.features.length - 8} more</li> : null}
                    </ul>
                  ) : null}
                  <div className="mt-auto flex flex-col gap-2 pt-6">
                    <ButtonLink href="/sign-up" variant={highlighted ? "primary" : "secondary"} className="rounded-[var(--wh-radius-pill)]">Get Started</ButtonLink>
                    <ButtonLink href="/sign-in" variant="quiet">Sign In</ButtonLink>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="relative overflow-hidden py-24 lg:py-32" style={{ background: "var(--wh-gradient-sunset)" }}>
          <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-16 w-[36rem] max-w-[140vw] opacity-70" data-parallax="-0.08">
            <HomeIllustration className="w-full" />
          </div>
          <div className="relative mx-auto max-w-[var(--wh-content-wide)] px-4 lg:px-8">
            <div className="wh-reveal max-w-xl">
              <h2 className="text-[var(--wh-text-hero)] leading-[0.98] font-bold tracking-[-0.03em] text-balance">
                A brighter tomorrow<br />starts at home.
              </h2>
              <p className="mt-5 text-lg text-[var(--wh-foreground-muted)]">Join families building happier, calmer homes with WonderHome.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/sign-up" className="min-h-12 rounded-[var(--wh-radius-pill)] px-6 text-base shadow-[var(--wh-shadow-primary)]">
                  Get Started Free <ArrowRight aria-hidden className="size-4" />
                </ButtonLink>
                <ButtonLink href="/sign-in" variant="secondary" className="min-h-12 rounded-[var(--wh-radius-pill)] px-6 text-base">Sign In</ButtonLink>
              </div>
              <p className="mt-3 text-xs text-[var(--wh-foreground-subtle)]">No credit card required</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--wh-border)] bg-[var(--wh-surface)]/70">
        <div className="mx-auto flex max-w-[var(--wh-content-wide)] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between lg:px-8">
          <Wordmark tagline size={32} />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--wh-foreground-muted)]">
              {[["#top", "Home"], ["#features", "Features"], ["#pricing", "Pricing"], ["#security", "Security"], ["#security", "Privacy"], ["/ai", "Help"], ["/sign-in", "Sign In"]].map(([href, label]) => (
                <li key={label}><a href={href} className="hover:text-[var(--wh-foreground)]">{label}</a></li>
              ))}
            </ul>
          </nav>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">Made for families. Built for a brighter tomorrow. <span aria-hidden>♥</span></p>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-3 py-1 text-[0.6875rem] font-bold tracking-[0.1em] text-[var(--wh-primary)] uppercase">
      {children}
    </span>
  );
}

function Section({ id, eyebrow, title, lede, children }: { id: string; eyebrow: string; title: React.ReactNode; lede: string; children: React.ReactNode }) {
  return (
    <section id={id} className="py-20 lg:py-28">
      <div className="mx-auto max-w-[var(--wh-content-wide)] px-4 lg:px-8">
        <div className="wh-reveal mx-auto max-w-2xl text-center">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-4 text-[var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">{title}</h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-[var(--wh-foreground-muted)]">{lede}</p>
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function StoryCard({ icon, tone, title, copy, index }: { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; copy: string; index: number }) {
  return (
    <div className="wh-reveal wh-lift overflow-hidden rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]" style={{ "--wh-reveal-delay": `${index * 80}ms` } as React.CSSProperties}>
      <div aria-hidden className="relative h-28" style={{ background: "var(--wh-gradient-hero)" }}>
        <div className="absolute inset-0 grid place-items-center">
          <IconTile icon={icon} tone={tone} size="lg" className="size-16 rounded-full [&_svg]:size-8" />
        </div>
        <BrandMark size={18} className="absolute right-3 bottom-3 opacity-40" />
      </div>
      <div className="p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{copy}</p>
      </div>
    </div>
  );
}
