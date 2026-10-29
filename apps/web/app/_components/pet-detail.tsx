import type { Pet } from "@wonderhome/core/home/pets";
import { completedYears, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { requestT } from "@wonderhome/core/i18n/request";

import { formatDate } from "../_lib/session";
import { PET_PREFERENCE_KINDS } from "@wonderhome/core/home/pet-preferences";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";

import { PetPreferences } from "./pet-preferences";
import { PetProfileForm } from "./pet-profile-form";
import { RetirePetControl } from "./retire-pet-control";
import { MemberAvatarControl, type AvatarLabels } from "./member-avatar-control";

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/** Everything the household has told WonderHome about one pet — the same shape as `MemberDetail`, because a pet is part of the family, not a different kind of screen. */
export function PetDetail({
  pet,
  timezone,
  editable,
  householdId,
  avatarLabels,
}: {
  pet: Pet;
  timezone: string;
  editable: boolean;
  householdId: string;
  /** The photo control's words in the viewer's language; English otherwise. */
  avatarLabels?: AvatarLabels;
}) {
  const t = requestT();
  const dob = parseDateOfBirth(pet.dateOfBirth ?? null);
  const age = dob ? t("family.fact.yearsOld", { count: completedYears(dob) }) : null;
  const born = pet.dateOfBirth ? formatDate(timezone, new Date(pet.dateOfBirth), "long") : null;
  const vet = pet.vetName && pet.vetContact ? `${pet.vetName} — ${pet.vetContact}` : (pet.vetName ?? pet.vetContact);

  return (
    <div className="space-y-3">
      {editable ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PetProfileForm
            householdId={householdId}
            petId={pet.id}
            initial={{
              name: pet.name,
              species: pet.species,
              dateOfBirth: pet.dateOfBirth ?? null,
              gender: pet.gender ?? null,
              vetName: pet.vetName ?? null,
              vetContact: pet.vetContact ?? null,
              notes: pet.notes ?? null,
            }}
          />
          <MemberAvatarControl variant="icons" kind="pet" householdId={householdId} memberId={pet.id} displayName={pet.name} avatarUrl={pet.photoUrl ?? null} labels={avatarLabels} />
          <RetirePetControl householdId={householdId} petId={pet.id} name={pet.name} active={pet.active !== false} />
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Fact label={t("family.fact.species")} value={pet.species} />
        <Fact label={t("family.fact.age")} value={age} />
        <Fact label={t("family.fact.dateOfBirth")} value={born} />
        <Fact label={t("family.fact.gender")} value={pet.gender ?? null} />
        <Fact label={t("family.fact.vet")} value={vet ?? null} />
        <Fact label={t("family.fact.notes")} value={pet.notes ?? null} />
        <Fact label={t("family.fact.status")} value={pet.active === false ? t("family.retired") : null} />
      </dl>
      <PetPreferences
        householdId={householdId}
        petId={pet.id}
        petName={pet.name}
        entries={(pet.preferences ?? []).map((entry) => ({ id: entry.id, kind: entry.kind, subject: entry.subject, note: entry.note }))}
        editable={editable}
        words={{
          title: t("family.petPrefs.title"),
          empty: t("family.petPrefs.empty", { name: "{name}" }),
          add: t("family.petPrefs.add"),
          sheetAdd: t("family.petPrefs.sheetAdd", { name: "{name}" }),
          sheetEdit: t("family.petPrefs.sheetEdit", { name: "{name}" }),
          kind: t("family.petPrefs.kind"),
          subject: t("family.petPrefs.subject"),
          subjectHint: t("family.petPrefs.subjectHint"),
          note: t("family.petPrefs.note"),
          save: t("family.petPrefs.save"),
          saving: t("common.saving"),
          edit: t("family.petPrefs.edit", { name: "{name}" }),
          remove: t("family.petPrefs.remove", { name: "{name}" }),
          addNew: t("common.addNew"),
          chooseExisting: t("common.chooseExisting"),
          kinds: Object.fromEntries(PET_PREFERENCE_KINDS.map((kind) => [kind, t(`family.petPrefs.kind.${kind}` as TranslationKey)])),
        }}
      />
    </div>
  );
}
