import { Baby, ChevronRight, HandHelping, PawPrint, Plus, Settings2, Sparkles, UserRound, Users, Zap } from "lucide-react";
import Link from "next/link";

import type { OnboardingSnapshot } from "@wonderhome/core/household/onboarding-repository";
import type { OnboardingStep } from "@wonderhome/core/household/onboarding";
import { WORK_ARRANGEMENTS, type HouseholdMember } from "@wonderhome/core/identity/households";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Card } from "@wonderhome/core/ui/card";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { CozyCornerIllustration } from "@wonderhome/core/ui/cozy-corner-illustration";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";
import { Stepper } from "@wonderhome/core/ui/stepper";

import { moveAction, saveAdultsAction, saveBasicsAction, saveChildrenAction, savePetsAndHelpAction } from "../(auth)/onboarding-actions";
import { SubmitButton } from "../_components/submit-pill";
import { LaterButton, OnboardingFrame } from "./frame";
import { OnboardingForm } from "./onboarding-form";

/** Relationship words to pick from — the family's own words, never assumed from a gender (story 02-009). */
const ADULT_RELATIONSHIPS = ["Dad", "Mom", "Partner", "Parent", "Grandparent", "Aunt", "Uncle"];
const CHILD_GENDERS = ["Boy", "Girl"];
const PET_KINDS = ["Dog", "Cat", "Bird", "Fish", "Rabbit"];
const HELPER_ROLES = ["Maid", "Cook", "Driver", "Nanny", "Gardener", "Caregiver"];
const WORK_LABELS: Record<(typeof WORK_ARRANGEMENTS)[number], string> = {
  office: "Work from office",
  home: "Work from home",
  hybrid: "Hybrid",
  not_working: "Not working",
};
/** Monday first, as a week is read; values are day_of_week (0 = Sunday). */
const WEEKDAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];
/** Half-hour steps across a working day. */
const TIMES = Array.from({ length: 35 }, (_, index) => {
  const minutes = 5 * 60 + index * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const hour = Math.floor(minutes / 60);
  const label = `${hour % 12 === 0 ? 12 : hour % 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  return { value, label };
});

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function active(snapshot: OnboardingSnapshot, type: HouseholdMember["memberType"]) {
  return snapshot.members.filter((member) => member.status === "active" && member.memberType === type);
}

// ---------------------------------------------------------------------------
// 1. Welcome
// ---------------------------------------------------------------------------

export function WelcomeScreen({ firstName }: { firstName: string }) {
  const points = [
    { icon: Zap, tone: "attention" as const, text: "Get a personalised home setup in minutes" },
    { icon: Sparkles, tone: "ai" as const, text: "Ready to use from day one" },
    { icon: Settings2, tone: "primary" as const, text: "You can change anything later" },
  ];
  return (
    <OnboardingFrame step="welcome" accent="Less mental load. More family time.">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--wh-primary)]">Welcome, {firstName}</p>
        <h1 className="text-[length:var(--wh-text-display)] leading-[1.08] font-bold tracking-tight text-balance">Tell us about your family.</h1>
        <p className="text-base text-[var(--wh-foreground-muted)]">We&apos;ll prepare your home for you.</p>
      </div>
      <div className="overflow-hidden rounded-[var(--wh-radius-lg)]" style={{ background: "var(--wh-gradient-hero)" }}>
        <CozyCornerIllustration className="mx-auto block h-auto w-full max-w-md" />
      </div>
      <Card className="space-y-3 p-4">
        {points.map((point) => (
          <div key={point.text} className="flex items-center gap-3">
            <IconTile icon={point.icon} tone={point.tone} size="sm" />
            <p className="text-[0.9375rem]">{point.text}</p>
          </div>
        ))}
      </Card>
      <OnboardingForm action={moveAction}>
        <input type="hidden" name="to" value="basics" />
        <SubmitButton className="w-full" pendingLabel="One moment…">
          Let&apos;s get started
        </SubmitButton>
      </OnboardingForm>
      <LaterButton step="welcome" />
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 2. Family basics
// ---------------------------------------------------------------------------

export function BasicsScreen({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const { composition } = snapshot.state;
  // Never fewer than who is already on record.
  const at = (kind: keyof typeof composition, named: number) => Math.max(composition[kind], named);
  return (
    <OnboardingFrame
      step="basics"
      progress={1}
      back="/onboarding?step=welcome"
      title="Tell us a little about your home"
      lede="This helps us create a personalised setup for your family."
      accent="Every home is its own."
    >
      <OnboardingForm action={saveBasicsAction} className="space-y-5">
        <Card className="divide-y divide-[var(--wh-border)] px-4 py-1">
          <Stepper label="Adults" name="adults" min={1} defaultValue={at("adults", active(snapshot, "adult").length)} icon={<IconTile icon={UserRound} tone="primary" size="sm" />} />
          <Stepper label="Children" name="children" defaultValue={at("children", active(snapshot, "child").length)} icon={<IconTile icon={Baby} tone="school" size="sm" />} />
          <Stepper label="Pets" name="pets" defaultValue={at("pets", snapshot.pets.length)} icon={<IconTile icon={PawPrint} tone="handled" size="sm" />} />
          <Stepper label="Household help" name="helpers" noun="helpers" defaultValue={at("helpers", active(snapshot, "helper").length)} icon={<IconTile icon={HandHelping} tone="people" size="sm" />} />
        </Card>
        <SubmitButton className="w-full" pendingLabel="Saving…">
          Next
        </SubmitButton>
      </OnboardingForm>
      <LaterButton step="basics" />
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 3. Household overview
// ---------------------------------------------------------------------------

export function OverviewScreen({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const { composition } = snapshot.state;
  const adults = active(snapshot, "adult");
  const children = active(snapshot, "child");
  const helpers = active(snapshot, "helper");
  const names = (list: { displayName?: string; name?: string }[]) =>
    list.map((entry) => entry.displayName ?? entry.name).filter(Boolean).join(", ");

  const rows = [
    { key: "adults", label: "Adults", count: Math.max(composition.adults, adults.length), detail: plural(Math.max(composition.adults, adults.length), "person", "people"), people: adults.map((a) => a.displayName), named: names(adults), step: "adults" },
    { key: "children", label: "Children", count: Math.max(composition.children, children.length), detail: plural(Math.max(composition.children, children.length), "child", "children"), people: children.map((c) => c.displayName), named: names(children), step: "children" },
    { key: "pets", label: "Pets", count: Math.max(composition.pets, snapshot.pets.length), detail: plural(Math.max(composition.pets, snapshot.pets.length), "pet"), people: [], named: names(snapshot.pets), step: "pets" },
    { key: "helpers", label: "Household help", count: Math.max(composition.helpers, helpers.length), detail: plural(Math.max(composition.helpers, helpers.length), "helper"), people: helpers.map((h) => h.displayName), named: names(helpers), step: "pets" },
  ].filter((row) => row.count > 0);

  return (
    <OnboardingFrame
      step="overview"
      progress={2}
      back="/onboarding?step=basics"
      title="Here's your household"
      lede="We've made a starting point from your answers. Next, a few names."
      accent="Home runs smoother. Together."
    >
      <div className="space-y-3">
        {rows.map((row) => (
          <Link
            key={row.key}
            href={`/onboarding?step=${row.step}`}
            className="flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
          >
            {row.people.length > 0 ? (
              <span className="flex shrink-0 -space-x-2">
                {row.people.slice(0, 3).map((name) => (
                  <Avatar key={name} name={name} size="md" className="ring-2 ring-[var(--wh-surface)]" />
                ))}
              </span>
            ) : (
              <IconTile icon={row.key === "pets" ? PawPrint : row.key === "helpers" ? HandHelping : Users} tone={row.key === "pets" ? "handled" : "people"} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{row.label}</span>
              <span className="block text-sm text-[var(--wh-foreground-muted)]">{row.named || row.detail}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-[var(--wh-foreground-subtle)]" aria-hidden />
          </Link>
        ))}
      </div>
      <OnboardingForm action={moveAction}>
        <input type="hidden" name="to" value="adults" />
        <SubmitButton className="w-full" pendingLabel="One moment…">
          Looks good, continue
        </SubmitButton>
      </OnboardingForm>
      <Link href="/onboarding?step=basics" className="mx-auto inline-flex min-h-11 items-center px-4 text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
        Edit details
      </Link>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// People tabs: Adults · Children · Pets · Help — each saves before it moves
// ---------------------------------------------------------------------------

function PeopleTabs({ current, snapshot }: { current: "adults" | "children" | "pets" | "help"; snapshot: OnboardingSnapshot }) {
  const { composition } = snapshot.state;
  const tabs = [
    { key: "adults", label: "Adults", to: "adults", show: true },
    { key: "children", label: "Children", to: "children", show: composition.children > 0 || active(snapshot, "child").length > 0 },
    { key: "pets", label: "Pets", to: "pets", show: composition.pets > 0 || snapshot.pets.length > 0 },
    { key: "help", label: "Help", to: "pets", show: composition.helpers > 0 || active(snapshot, "helper").length > 0 },
  ].filter((tab) => tab.show);
  if (tabs.length < 2) return null;
  return (
    <div role="group" aria-label="Who to add" className="flex flex-wrap gap-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] p-1">
      {tabs.map((tab) =>
        tab.key === current || (current === "pets" && tab.key === "help") || (current === "help" && tab.key === "pets") ? (
          <span key={tab.key} aria-current="step" className="inline-flex min-h-9 flex-1 items-center justify-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface)] px-3 text-sm font-semibold text-[var(--wh-primary)] shadow-[var(--wh-shadow-card)]">
            {tab.label}
          </span>
        ) : (
          <button
            key={tab.key}
            type="submit"
            name="intent"
            value={`goto:${tab.to}`}
            className="inline-flex min-h-9 flex-1 items-center justify-center rounded-[var(--wh-radius-pill)] px-3 text-sm font-medium text-[var(--wh-foreground-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
          >
            {tab.label}
          </button>
        ),
      )}
    </div>
  );
}

function AddRowButton({ intent, children }: { intent: string; children: string }) {
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      className="mx-auto flex min-h-11 items-center gap-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-4 text-sm font-semibold text-[var(--wh-primary)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
    >
      <Plus className="size-4" aria-hidden />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 4. Adults
// ---------------------------------------------------------------------------

export function AdultsScreen({ snapshot, selfId, backTo }: { snapshot: OnboardingSnapshot; selfId: string; backTo: OnboardingStep }) {
  const adults = active(snapshot, "adult").sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : 0));
  const rows = Math.max(snapshot.state.composition.adults, adults.length, 1);
  return (
    <OnboardingFrame step="adults" progress={2} back={`/onboarding?step=${backTo}`} close title="Let's add some basic details" lede="Names first — and how each adult usually spends the week, if you like." accent="Everyone has a place here.">
      <OnboardingForm action={saveAdultsAction} className="space-y-4">
        <input type="hidden" name="rows" value={rows} />
        <PeopleTabs current="adults" snapshot={snapshot} />
        {Array.from({ length: rows }, (_, index) => {
          const adult = adults[index];
          const self = adult?.id === selfId;
          return (
            <Card key={adult?.id ?? `new-${index}`} className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={adult?.displayName ?? "?"} size="lg" />
                <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{self ? "You" : adult ? adult.displayName : `Adult ${index + 1}`}</p>
              </div>
              {adult ? <input type="hidden" name={`member_${index}`} value={adult.id} /> : null}
              <Field label="Name" name={`name_${index}`} defaultValue={adult?.displayName ?? ""} autoComplete="off" required={self} />
              <ComboboxField
                label="Family calls them"
                name={`relationship_${index}`}
                options={ADULT_RELATIONSHIPS}
                defaultValue={adult?.relationship ?? undefined}
                emptyLabel="Not recorded"
                addNewLabel="Something else…"
                newValuePlaceholder="What the family calls them"
              />
              <ChoiceChips
                legend="Typical work schedule (optional)"
                name={`work_${index}`}
                options={WORK_ARRANGEMENTS.map((value) => ({ value, label: WORK_LABELS[value] }))}
                defaultValue={adult?.workArrangement ?? null}
              />
            </Card>
          );
        })}
        <AddRowButton intent="add_row">Add another adult</AddRowButton>
        <SubmitButton className="w-full" pendingLabel="Saving…">
          Next
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 5. Children
// ---------------------------------------------------------------------------

export function ChildrenScreen({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const children = active(snapshot, "child");
  const rows = Math.max(snapshot.state.composition.children, children.length, 1);
  return (
    <OnboardingFrame step="children" progress={3} back="/onboarding?step=adults" close title="Tell us about your children" lede="An age is enough — it decides which routines suit them. School is optional; we can ask later." accent="Little ones, big hearts.">
      <OnboardingForm action={saveChildrenAction} className="space-y-4">
        <input type="hidden" name="rows" value={rows} />
        <PeopleTabs current="children" snapshot={snapshot} />
        {Array.from({ length: rows }, (_, index) => {
          const child = children[index];
          return (
            <Card key={child?.id ?? `new-${index}`} className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={child?.displayName ?? "?"} size="lg" />
                <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{child ? child.displayName : `Child ${index + 1}`}</p>
              </div>
              {child ? <input type="hidden" name={`member_${index}`} value={child.id} /> : null}
              <Field label="Name" name={`name_${index}`} defaultValue={child?.displayName ?? ""} autoComplete="off" />
              <div className="grid gap-4 sm:grid-cols-2">
                <ComboboxField
                  label="Gender (optional)"
                  name={`gender_${index}`}
                  options={CHILD_GENDERS}
                  defaultValue={child?.gender ?? undefined}
                  emptyLabel="Not recorded"
                  addNewLabel="Describe another way…"
                  newValuePlaceholder="In their own words"
                />
                <Select label="Age" name={`age_${index}`} defaultValue={child?.ageYears != null ? String(child.ageYears) : ""}>
                  <option value="">Not sure</option>
                  <option value="0">Under 1</option>
                  {Array.from({ length: 17 }, (_, age) => (
                    <option key={age + 1} value={age + 1}>
                      {plural(age + 1, "year")}
                    </option>
                  ))}
                </Select>
              </div>
              <Field
                label="School (optional)"
                name={`school_${index}`}
                defaultValue={child ? (snapshot.schools.get(child.id)?.schoolName ?? "") : ""}
                autoComplete="off"
                hint="We can help with school routines, homework and activities."
              />
            </Card>
          );
        })}
        <AddRowButton intent="add_row">Add another child</AddRowButton>
        <SubmitButton className="w-full" pendingLabel="Saving…">
          Next
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 6. Pets and household help
// ---------------------------------------------------------------------------

export function PetsAndHelpScreen({ snapshot, backTo }: { snapshot: OnboardingSnapshot; backTo: OnboardingStep }) {
  const { composition } = snapshot.state;
  const helpers = active(snapshot, "helper");
  const petRows = Math.max(composition.pets, snapshot.pets.length);
  const helperRows = Math.max(composition.helpers, helpers.length);
  return (
    <OnboardingFrame step="pets" progress={3} back={`/onboarding?step=${backTo}`} close title="Pets and household help" lede="Who else keeps the home going — and when your help usually comes." accent="Every paw and every helping hand.">
      <OnboardingForm action={savePetsAndHelpAction} className="space-y-4">
        <input type="hidden" name="pet_rows" value={petRows} />
        <input type="hidden" name="helper_rows" value={helperRows} />
        <PeopleTabs current="pets" snapshot={snapshot} />

        {petRows > 0 ? (
          <section aria-labelledby="pets-heading" className="space-y-3">
            <h2 id="pets-heading" className="text-lg font-semibold tracking-tight">
              Pets
            </h2>
            {Array.from({ length: petRows }, (_, index) => {
              const pet = snapshot.pets[index];
              return (
                <Card key={pet?.id ?? `new-pet-${index}`} className="space-y-4 p-4">
                  <div className="flex items-center gap-3">
                    <IconTile icon={PawPrint} tone="handled" size="lg" />
                    <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{pet ? pet.name : `Pet ${index + 1}`}</p>
                  </div>
                  {pet ? <input type="hidden" name={`pet_${index}`} value={pet.id} /> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" name={`pet_name_${index}`} defaultValue={pet?.name ?? ""} autoComplete="off" />
                    <ComboboxField label="Kind of pet" name={`pet_species_${index}`} options={PET_KINDS} defaultValue={pet?.species ?? undefined} addNewLabel="Another kind…" newValuePlaceholder="e.g. Tortoise" />
                  </div>
                </Card>
              );
            })}
            <AddRowButton intent="add_pet">Add another pet</AddRowButton>
          </section>
        ) : null}

        <section id="help" aria-labelledby="help-heading" className="space-y-3">
          <h2 id="help-heading" className="text-lg font-semibold tracking-tight">
            Household help
          </h2>
          {Array.from({ length: helperRows }, (_, index) => {
            const helper = helpers[index];
            const windows = helper ? (snapshot.availability.get(helper.id) ?? []) : [];
            return (
              <Card key={helper?.id ?? `new-helper-${index}`} className="space-y-4 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={helper?.displayName ?? "?"} size="lg" />
                  <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{helper ? helper.displayName : `Helper ${index + 1}`}</p>
                </div>
                {helper ? <input type="hidden" name={`helper_${index}`} value={helper.id} /> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" name={`helper_name_${index}`} defaultValue={helper?.displayName ?? ""} autoComplete="off" />
                  <ComboboxField label="What they do" name={`helper_role_${index}`} options={HELPER_ROLES} defaultValue={helper?.occupation ?? undefined} emptyLabel="Not recorded" addNewLabel="Something else…" newValuePlaceholder="e.g. Tutor" />
                </div>
                <HelperHours prefix={`helper_${index}_`} windows={windows} />
              </Card>
            );
          })}
          <AddRowButton intent="add_helper">{helperRows > 0 ? "Add another helper" : "Add a helper"}</AddRowButton>
        </section>

        <SubmitButton className="w-full" pendingLabel="Saving…">
          Next
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

/** The days a helper comes and their usual hours, as one pattern. Shared with the guided question. */
export function HelperHours({ prefix, windows }: { prefix: string; windows: readonly { dayOfWeek: number; startTime: string; endTime: string }[] }) {
  const first = windows[0];
  return (
    <div className="space-y-3">
      <ChoiceChips legend="Working days" name={`${prefix}days`} type="checkbox" size="sm" options={WEEKDAYS} defaultValue={windows.map((window) => String(window.dayOfWeek))} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="From" name={`${prefix}start`} defaultValue={first?.startTime ?? "09:00"}>
          {TIMES.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
        <Select label="Until" name={`${prefix}end`} defaultValue={first?.endTime ?? "13:00"}>
          {TIMES.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
