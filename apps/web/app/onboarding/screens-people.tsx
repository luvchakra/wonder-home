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
import { genderFieldLabels } from "../_lib/member-form-labels";
import { LaterButton, OnboardingFrame, setupChrome, type SetupWords } from "./frame";
import { OnboardingForm } from "./onboarding-form";

/**
 * Relationship words to pick from — the family's own words, never assumed
 * from a gender (story 02-009). The value saved is always this English word;
 * only what is shown for it follows the reader's language (story 22-004).
 */
const ADULT_RELATIONSHIPS = ["Dad", "Mom", "Partner", "Parent", "Grandparent", "Aunt", "Uncle"] as const;
const CHILD_GENDERS = ["Boy", "Girl"] as const;
const PET_KINDS = ["Dog", "Cat", "Bird", "Fish", "Rabbit"] as const;
const HELPER_ROLES = ["Maid", "Cook", "Driver", "Nanny", "Gardener", "Caregiver"] as const;
/** Monday first, as a week is read; values are day_of_week (0 = Sunday). */
const WEEKDAY_VALUES = ["1", "2", "3", "4", "5", "6", "0"] as const;
/** Half-hour steps across a working day: the value saved, and the clock reading for it. */
const TIMES = Array.from({ length: 35 }, (_, index) => {
  const minutes = 5 * 60 + index * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const hour = Math.floor(minutes / 60);
  return { value, clock: `${hour % 12 === 0 ? 12 : hour % 12}:${String(minutes % 60).padStart(2, "0")}`, morning: hour < 12 };
});

/** The words shown for each stored option, in the reader's language. */
function shownAs<T extends string>(options: readonly T[], words: (option: T) => string): Record<string, string> {
  return Object.fromEntries(options.map((option) => [option, words(option)]));
}

function active(snapshot: OnboardingSnapshot, type: HouseholdMember["memberType"]) {
  return snapshot.members.filter((member) => member.status === "active" && member.memberType === type);
}

// ---------------------------------------------------------------------------
// 1. Welcome
// ---------------------------------------------------------------------------

export function WelcomeScreen({ firstName, words }: { firstName: string; words: SetupWords }) {
  const { t } = words;
  const points = [
    { icon: Zap, tone: "attention" as const, text: t("setupWizard.welcome.point1") },
    { icon: Sparkles, tone: "ai" as const, text: t("setupWizard.welcome.point2") },
    { icon: Settings2, tone: "primary" as const, text: t("setupWizard.welcome.point3") },
  ];
  return (
    <OnboardingFrame step="welcome" {...setupChrome(words)} accent={t("entry.script.lessLoad")}>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--wh-primary)]">{t("setupWizard.welcome.greeting", { name: firstName })}</p>
        <h1 className="text-[length:var(--wh-text-display)] leading-[1.08] font-bold tracking-tight text-balance">{t("setupWizard.welcome.title")}</h1>
        <p className="text-base text-[var(--wh-foreground-muted)]">{t("setupWizard.welcome.lede")}</p>
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
        <SubmitButton className="w-full" pendingLabel={t("setupWizard.oneMoment")}>
          {t("setupWizard.welcome.start")}
        </SubmitButton>
      </OnboardingForm>
      <LaterButton step="welcome" label={t("common.later")} />
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 2. Family basics
// ---------------------------------------------------------------------------

export function BasicsScreen({ snapshot, words }: { snapshot: OnboardingSnapshot; words: SetupWords }) {
  const { t } = words;
  const { composition } = snapshot.state;
  // Never fewer than who is already on record.
  const at = (kind: keyof typeof composition, named: number) => Math.max(composition[kind], named);
  return (
    <OnboardingFrame
      step="basics"
      progress={1}
      {...setupChrome(words, 1)}
      back="/onboarding?step=welcome"
      title={t("setupWizard.basics.title")}
      lede={t("setupWizard.basics.lede")}
      accent={t("setupWizard.basics.accent")}
    >
      <OnboardingForm action={saveBasicsAction} className="space-y-5">
        <Card className="divide-y divide-[var(--wh-border)] px-4 py-1">
          <Stepper
            label={t("setupWizard.group.adults")}
            name="adults"
            min={1}
            defaultValue={at("adults", active(snapshot, "adult").length)}
            icon={<IconTile icon={UserRound} tone="primary" size="sm" />}
            fewerLabel={t("setupWizard.basics.fewer.adults")}
            moreLabel={t("setupWizard.basics.more.adults")}
          />
          <Stepper
            label={t("setupWizard.group.children")}
            name="children"
            defaultValue={at("children", active(snapshot, "child").length)}
            icon={<IconTile icon={Baby} tone="school" size="sm" />}
            fewerLabel={t("setupWizard.basics.fewer.children")}
            moreLabel={t("setupWizard.basics.more.children")}
          />
          <Stepper
            label={t("setupWizard.group.pets")}
            name="pets"
            defaultValue={at("pets", snapshot.pets.length)}
            icon={<IconTile icon={PawPrint} tone="handled" size="sm" />}
            fewerLabel={t("setupWizard.basics.fewer.pets")}
            moreLabel={t("setupWizard.basics.more.pets")}
          />
          <Stepper
            label={t("setupWizard.group.helpers")}
            name="helpers"
            defaultValue={at("helpers", active(snapshot, "helper").length)}
            icon={<IconTile icon={HandHelping} tone="people" size="sm" />}
            fewerLabel={t("setupWizard.basics.fewer.helpers")}
            moreLabel={t("setupWizard.basics.more.helpers")}
          />
        </Card>
        <SubmitButton className="w-full" pendingLabel={t("common.saving")}>
          {t("common.next")}
        </SubmitButton>
      </OnboardingForm>
      <LaterButton step="basics" label={t("common.later")} />
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 3. Household overview
// ---------------------------------------------------------------------------

export function OverviewScreen({ snapshot, words }: { snapshot: OnboardingSnapshot; words: SetupWords }) {
  const { t } = words;
  const { composition } = snapshot.state;
  const adults = active(snapshot, "adult");
  const children = active(snapshot, "child");
  const helpers = active(snapshot, "helper");
  // Names are shown as written, joined the way this language joins a list.
  const names = (list: { displayName?: string; name?: string }[]) =>
    list.map((entry) => entry.displayName ?? entry.name).filter(Boolean).join(t("settingsPage.listSeparator"));
  const adultCount = Math.max(composition.adults, adults.length);
  const childCount = Math.max(composition.children, children.length);
  const petCount = Math.max(composition.pets, snapshot.pets.length);
  const helperCount = Math.max(composition.helpers, helpers.length);

  const rows = [
    { key: "adults", label: t("setupWizard.group.adults"), count: adultCount, detail: t("setupWizard.count.people", { count: adultCount }), people: adults.map((a) => a.displayName), named: names(adults), step: "adults" },
    { key: "children", label: t("setupWizard.group.children"), count: childCount, detail: t("setupWizard.count.children", { count: childCount }), people: children.map((c) => c.displayName), named: names(children), step: "children" },
    { key: "pets", label: t("setupWizard.group.pets"), count: petCount, detail: t("setupWizard.count.pets", { count: petCount }), people: [], named: names(snapshot.pets), step: "pets" },
    { key: "helpers", label: t("setupWizard.group.helpers"), count: helperCount, detail: t("setupWizard.count.helpers", { count: helperCount }), people: helpers.map((h) => h.displayName), named: names(helpers), step: "pets" },
  ].filter((row) => row.count > 0);

  return (
    <OnboardingFrame
      step="overview"
      progress={2}
      {...setupChrome(words, 2)}
      back="/onboarding?step=basics"
      title={t("setupWizard.overview.title")}
      lede={t("setupWizard.overview.lede")}
      accent={t("entry.script.together")}
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
        <SubmitButton className="w-full" pendingLabel={t("setupWizard.oneMoment")}>
          {t("setupWizard.overview.continue")}
        </SubmitButton>
      </OnboardingForm>
      <Link href="/onboarding?step=basics" className="mx-auto inline-flex min-h-11 items-center px-4 text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
        {t("setupWizard.overview.edit")}
      </Link>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// People tabs: Adults · Children · Pets · Help — each saves before it moves
// ---------------------------------------------------------------------------

function PeopleTabs({ current, snapshot, words }: { current: "adults" | "children" | "pets" | "help"; snapshot: OnboardingSnapshot; words: SetupWords }) {
  const { t } = words;
  const { composition } = snapshot.state;
  const tabs = [
    { key: "adults", label: t("setupWizard.group.adults"), to: "adults", show: true },
    { key: "children", label: t("setupWizard.group.children"), to: "children", show: composition.children > 0 || active(snapshot, "child").length > 0 },
    { key: "pets", label: t("setupWizard.group.pets"), to: "pets", show: composition.pets > 0 || snapshot.pets.length > 0 },
    { key: "help", label: t("setupWizard.tab.help"), to: "pets", show: composition.helpers > 0 || active(snapshot, "helper").length > 0 },
  ].filter((tab) => tab.show);
  if (tabs.length < 2) return null;
  return (
    <div role="group" aria-label={t("setupWizard.tabs.label")} className="flex flex-wrap gap-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] p-1">
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

export function AdultsScreen({ snapshot, selfId, backTo, words }: { snapshot: OnboardingSnapshot; selfId: string; backTo: OnboardingStep; words: SetupWords }) {
  const { t } = words;
  const adults = active(snapshot, "adult").sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : 0));
  const rows = Math.max(snapshot.state.composition.adults, adults.length, 1);
  const relationshipWords = shownAs(ADULT_RELATIONSHIPS, (option) => t(`setupWizard.relationship.${option}`));
  return (
    <OnboardingFrame
      step="adults"
      progress={2}
      {...setupChrome(words, 2)}
      back={`/onboarding?step=${backTo}`}
      close
      title={t("setupWizard.adults.title")}
      lede={t("setupWizard.adults.lede")}
      accent={t("setupWizard.adults.accent")}
    >
      <OnboardingForm action={saveAdultsAction} className="space-y-4">
        <input type="hidden" name="rows" value={rows} />
        <PeopleTabs current="adults" snapshot={snapshot} words={words} />
        {Array.from({ length: rows }, (_, index) => {
          const adult = adults[index];
          const self = adult?.id === selfId;
          return (
            <Card key={adult?.id ?? `new-${index}`} className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={adult?.displayName ?? "?"} size="lg" />
                <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{self ? t("setupWizard.adults.you") : adult ? adult.displayName : t("setupWizard.adults.numbered", { number: index + 1 })}</p>
              </div>
              {adult ? <input type="hidden" name={`member_${index}`} value={adult.id} /> : null}
              <Field label={t("setupWizard.name")} name={`name_${index}`} defaultValue={adult?.displayName ?? ""} autoComplete="off" required={self} />
              <ComboboxField
                label={t("setupWizard.adults.relationship")}
                name={`relationship_${index}`}
                options={[...ADULT_RELATIONSHIPS]}
                optionLabels={relationshipWords}
                defaultValue={adult?.relationship ?? undefined}
                emptyLabel={t("setupWizard.notRecorded")}
                addNewLabel={t("setupWizard.somethingElse")}
                chooseExistingLabel={t("common.chooseExisting")}
                newValuePlaceholder={t("setupWizard.adults.relationshipPlaceholder")}
              />
              <ChoiceChips
                legend={t("setupWizard.adults.work")}
                name={`work_${index}`}
                options={WORK_ARRANGEMENTS.map((value) => ({ value, label: t(`setupWizard.work.${value}`) }))}
                defaultValue={adult?.workArrangement ?? null}
              />
            </Card>
          );
        })}
        <AddRowButton intent="add_row">{t("setupWizard.adults.add")}</AddRowButton>
        <SubmitButton className="w-full" pendingLabel={t("common.saving")}>
          {t("common.next")}
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 5. Children
// ---------------------------------------------------------------------------

export function ChildrenScreen({ snapshot, words }: { snapshot: OnboardingSnapshot; words: SetupWords }) {
  const { t } = words;
  const children = active(snapshot, "child");
  const rows = Math.max(snapshot.state.composition.children, children.length, 1);
  const gender = genderFieldLabels(t);
  const genderWords = shownAs(CHILD_GENDERS, (option) => t(`setupWizard.gender.${option}`));
  return (
    <OnboardingFrame
      step="children"
      progress={3}
      {...setupChrome(words, 3)}
      back="/onboarding?step=adults"
      close
      title={t("setupWizard.children.title")}
      lede={t("setupWizard.children.lede")}
      accent={t("setupWizard.children.accent")}
    >
      <OnboardingForm action={saveChildrenAction} className="space-y-4">
        <input type="hidden" name="rows" value={rows} />
        <PeopleTabs current="children" snapshot={snapshot} words={words} />
        {Array.from({ length: rows }, (_, index) => {
          const child = children[index];
          return (
            <Card key={child?.id ?? `new-${index}`} className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={child?.displayName ?? "?"} size="lg" />
                <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{child ? child.displayName : t("setupWizard.children.numbered", { number: index + 1 })}</p>
              </div>
              {child ? <input type="hidden" name={`member_${index}`} value={child.id} /> : null}
              <Field label={t("setupWizard.name")} name={`name_${index}`} defaultValue={child?.displayName ?? ""} autoComplete="off" />
              <div className="grid gap-4 sm:grid-cols-2">
                <ComboboxField
                  label={gender.label}
                  name={`gender_${index}`}
                  options={[...CHILD_GENDERS]}
                  optionLabels={genderWords}
                  defaultValue={child?.gender ?? undefined}
                  emptyLabel={gender.empty}
                  addNewLabel={gender.addNew}
                  chooseExistingLabel={gender.chooseExisting}
                  newValuePlaceholder={gender.newPlaceholder}
                />
                <Select label={t("setupWizard.children.age")} name={`age_${index}`} defaultValue={child?.ageYears != null ? String(child.ageYears) : ""}>
                  <option value="">{t("setupWizard.children.ageUnknown")}</option>
                  <option value="0">{t("setupWizard.children.underOne")}</option>
                  {Array.from({ length: 17 }, (_, age) => (
                    <option key={age + 1} value={age + 1}>
                      {t("settingsPage.privacy.days.years", { count: age + 1 })}
                    </option>
                  ))}
                </Select>
              </div>
              <Field
                label={t("setupWizard.children.school")}
                name={`school_${index}`}
                defaultValue={child ? (snapshot.schools.get(child.id)?.schoolName ?? "") : ""}
                autoComplete="off"
                hint={t("setupWizard.children.schoolHint")}
              />
            </Card>
          );
        })}
        <AddRowButton intent="add_row">{t("setupWizard.children.add")}</AddRowButton>
        <SubmitButton className="w-full" pendingLabel={t("common.saving")}>
          {t("common.next")}
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 6. Pets and household help
// ---------------------------------------------------------------------------

export function PetsAndHelpScreen({ snapshot, backTo, words }: { snapshot: OnboardingSnapshot; backTo: OnboardingStep; words: SetupWords }) {
  const { t } = words;
  const speciesWords = shownAs(PET_KINDS, (option) => t(`setupWizard.species.${option}`));
  const roleWords = shownAs(HELPER_ROLES, (option) => t(`setupWizard.helperRole.${option}`));
  const { composition } = snapshot.state;
  const helpers = active(snapshot, "helper");
  const petRows = Math.max(composition.pets, snapshot.pets.length);
  const helperRows = Math.max(composition.helpers, helpers.length);
  return (
    <OnboardingFrame
      step="pets"
      progress={3}
      {...setupChrome(words, 3)}
      back={`/onboarding?step=${backTo}`}
      close
      title={t("setupWizard.pets.title")}
      lede={t("setupWizard.pets.lede")}
      accent={t("setupWizard.pets.accent")}
    >
      <OnboardingForm action={savePetsAndHelpAction} className="space-y-4">
        <input type="hidden" name="pet_rows" value={petRows} />
        <input type="hidden" name="helper_rows" value={helperRows} />
        <PeopleTabs current="pets" snapshot={snapshot} words={words} />

        {petRows > 0 ? (
          <section aria-labelledby="pets-heading" className="space-y-3">
            <h2 id="pets-heading" className="text-lg font-semibold tracking-tight">
              {t("setupWizard.group.pets")}
            </h2>
            {Array.from({ length: petRows }, (_, index) => {
              const pet = snapshot.pets[index];
              return (
                <Card key={pet?.id ?? `new-pet-${index}`} className="space-y-4 p-4">
                  <div className="flex items-center gap-3">
                    <IconTile icon={PawPrint} tone="handled" size="lg" />
                    <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{pet ? pet.name : t("setupWizard.pets.numbered", { number: index + 1 })}</p>
                  </div>
                  {pet ? <input type="hidden" name={`pet_${index}`} value={pet.id} /> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("setupWizard.name")} name={`pet_name_${index}`} defaultValue={pet?.name ?? ""} autoComplete="off" />
                    <ComboboxField
                      label={t("setupWizard.pets.kind")}
                      name={`pet_species_${index}`}
                      options={[...PET_KINDS]}
                      optionLabels={speciesWords}
                      defaultValue={pet?.species ?? undefined}
                      placeholder={t("setupWizard.chooseOne")}
                      addNewLabel={t("setupWizard.pets.anotherKind")}
                      chooseExistingLabel={t("common.chooseExisting")}
                      newValuePlaceholder={t("setupWizard.pets.kindPlaceholder")}
                    />
                  </div>
                </Card>
              );
            })}
            <AddRowButton intent="add_pet">{t("setupWizard.pets.add")}</AddRowButton>
          </section>
        ) : null}

        <section id="help" aria-labelledby="help-heading" className="space-y-3">
          <h2 id="help-heading" className="text-lg font-semibold tracking-tight">
            {t("setupWizard.group.helpers")}
          </h2>
          {Array.from({ length: helperRows }, (_, index) => {
            const helper = helpers[index];
            const windows = helper ? (snapshot.availability.get(helper.id) ?? []) : [];
            return (
              <Card key={helper?.id ?? `new-helper-${index}`} className="space-y-4 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={helper?.displayName ?? "?"} size="lg" />
                  <p className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{helper ? helper.displayName : t("setupWizard.helpers.numbered", { number: index + 1 })}</p>
                </div>
                {helper ? <input type="hidden" name={`helper_${index}`} value={helper.id} /> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("setupWizard.name")} name={`helper_name_${index}`} defaultValue={helper?.displayName ?? ""} autoComplete="off" />
                  <ComboboxField
                    label={t("setupWizard.helpers.role")}
                    name={`helper_role_${index}`}
                    options={[...HELPER_ROLES]}
                    optionLabels={roleWords}
                    defaultValue={helper?.occupation ?? undefined}
                    emptyLabel={t("setupWizard.notRecorded")}
                    addNewLabel={t("setupWizard.somethingElse")}
                    chooseExistingLabel={t("common.chooseExisting")}
                    newValuePlaceholder={t("setupWizard.helpers.rolePlaceholder")}
                  />
                </div>
                <HelperHours prefix={`helper_${index}_`} windows={windows} words={words} />
              </Card>
            );
          })}
          <AddRowButton intent="add_helper">{helperRows > 0 ? t("setupWizard.helpers.addAnother") : t("setupWizard.helpers.addFirst")}</AddRowButton>
        </section>

        <SubmitButton className="w-full" pendingLabel={t("common.saving")}>
          {t("common.next")}
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

/** The days a helper comes and their usual hours, as one pattern. Shared with the guided question. */
export function HelperHours({
  prefix,
  windows,
  words,
}: {
  prefix: string;
  windows: readonly { dayOfWeek: number; startTime: string; endTime: string }[];
  words: SetupWords;
}) {
  const { t } = words;
  const first = windows[0];
  const weekdays = WEEKDAY_VALUES.map((value) => ({ value, label: t(`helpers.day.short.${value}`) }));
  const times = TIMES.map((time) => ({ value: time.value, label: t(time.morning ? "setupWizard.time.am" : "setupWizard.time.pm", { time: time.clock }) }));
  return (
    <div className="space-y-3">
      <ChoiceChips legend={t("setupWizard.hours.days")} name={`${prefix}days`} type="checkbox" size="sm" options={weekdays} defaultValue={windows.map((window) => String(window.dayOfWeek))} />
      <div className="grid grid-cols-2 gap-3">
        <Select label={t("setupWizard.hours.from")} name={`${prefix}start`} defaultValue={first?.startTime ?? "09:00"}>
          {times.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
        <Select label={t("setupWizard.hours.until")} name={`${prefix}end`} defaultValue={first?.endTime ?? "13:00"}>
          {times.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
