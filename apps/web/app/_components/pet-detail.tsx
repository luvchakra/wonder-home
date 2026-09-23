import type { Pet } from "@wonderhome/core/home/pets";
import { completedYears, parseDateOfBirth } from "@wonderhome/core/identity/age";

import { formatDate } from "../_lib/session";
import { PetProfileForm } from "./pet-profile-form";
import { RetirePetControl } from "./retire-pet-control";

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
}: {
  pet: Pet;
  timezone: string;
  editable: boolean;
  householdId: string;
}) {
  const dob = parseDateOfBirth(pet.dateOfBirth ?? null);
  const age = dob ? `${completedYears(dob)} years old` : null;
  const born = pet.dateOfBirth ? formatDate(timezone, new Date(pet.dateOfBirth), "long") : null;
  const vet = pet.vetName && pet.vetContact ? `${pet.vetName} — ${pet.vetContact}` : (pet.vetName ?? pet.vetContact);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Fact label="Species" value={pet.species} />
        <Fact label="Age" value={age} />
        <Fact label="Date of birth" value={born} />
        <Fact label="Gender" value={pet.gender ?? null} />
        <Fact label="Vet" value={vet ?? null} />
        <Fact label="Notes" value={pet.notes ?? null} />
        <Fact label="Status" value={pet.active === false ? "Retired" : null} />
      </dl>
      {editable ? (
        <div className="flex flex-wrap gap-2">
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
          <RetirePetControl householdId={householdId} petId={pet.id} name={pet.name} active={pet.active !== false} />
        </div>
      ) : null}
    </div>
  );
}
