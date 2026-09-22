import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "./assessment";
import { maintenanceAgenda, type AssetCategory, type HomeAsset } from "./assets";
import { assessLaundry, type LaundryNeed, type LaundryState } from "./laundry";
import { petAgenda, type Pet, type PetCareKind, type PetCareNeed } from "./pets";
import { assessServiceRequest, openRequestAssetIds, type ServiceRequest, type ServiceStatus } from "./services";
import type { DeviceSignal, SignalKind } from "./signals";
import { dryingConditions, type WeatherWindow } from "./weather";

/**
 * Reading and writing the home domain (module 13).
 *
 * Every query goes through the caller's own Supabase client, so RLS applies to
 * the read as well as the write. Nothing here uses the service role: a
 * household's maintenance history is exactly the kind of data that should never
 * be fetched with a key that ignores who is asking.
 */

type Row = Record<string, unknown>;

export async function listAssets(supabase: SupabaseClient, householdId: string): Promise<HomeAsset[]> {
  const { data, error } = await supabase
    .from("home_assets")
    .select(
      "id, name, category, location, service_interval_days, last_serviced_on, warranty_expires_on, amc_expires_on, responsible_member_id, status",
    )
    .eq("household_id", householdId)
    .order("name", { ascending: true });

  if (error) throw new Error(`listAssets failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map(toAsset);
}

function toAsset(row: Row): HomeAsset {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as AssetCategory,
    location: (row.location as string | null) ?? null,
    serviceIntervalDays: (row.service_interval_days as number | null) ?? null,
    lastServicedOn: (row.last_serviced_on as string | null) ?? null,
    warrantyExpiresOn: (row.warranty_expires_on as string | null) ?? null,
    amcExpiresOn: (row.amc_expires_on as string | null) ?? null,
    responsibleMemberId: (row.responsible_member_id as string | null) ?? null,
    status: row.status as HomeAsset["status"],
  };
}

export type CreateAssetInput = {
  householdId: string;
  name: string;
  category?: AssetCategory;
  location?: string | null;
  serviceIntervalDays?: number | null;
  lastServicedOn?: string | null;
  warrantyExpiresOn?: string | null;
  amcExpiresOn?: string | null;
  responsibleMemberId?: string | null;
};

export async function createAsset(
  supabase: SupabaseClient,
  input: CreateAssetInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("home_assets")
    .insert({
      household_id: input.householdId,
      name: input.name,
      category: input.category ?? "appliance",
      location: input.location ?? null,
      service_interval_days: input.serviceIntervalDays ?? null,
      last_serviced_on: input.lastServicedOn ?? null,
      warranty_expires_on: input.warrantyExpiresOn ?? null,
      amc_expires_on: input.amcExpiresOn ?? null,
      responsible_member_id: input.responsibleMemberId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 42501 is RLS refusing the write; 23503 is the trigger catching a member
    // who belongs to a different household. Both are the caller's mistake, and
    // neither should surface as a 500.
    if (error.code === "42501") {
      throw ApiError.forbidden("Only a household administrator can add an asset.");
    }
    if (error.code === "23503") {
      throw ApiError.badRequest("That member is not part of this household.");
    }
    throw new Error(`createAsset failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

export async function listServiceRequests(
  supabase: SupabaseClient,
  householdId: string,
): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from("service_requests")
    .select(
      "id, asset_id, subject, provider_name, provider_contact, status, scheduled_for, next_action, next_action_by, updated_at",
    )
    .eq("household_id", householdId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`listServiceRequests failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    assetId: (row.asset_id as string | null) ?? null,
    subject: row.subject as string,
    providerName: (row.provider_name as string | null) ?? null,
    providerContact: (row.provider_contact as string | null) ?? null,
    status: row.status as ServiceStatus,
    scheduledFor: row.scheduled_for ? new Date(row.scheduled_for as string) : null,
    nextAction: (row.next_action as string | null) ?? null,
    nextActionBy: (row.next_action_by as ServiceRequest["nextActionBy"]) ?? null,
    updatedAt: new Date(row.updated_at as string),
  }));
}

export type CreateServiceRequestInput = {
  householdId: string;
  assetId?: string | null;
  subject: string;
  providerName?: string | null;
  providerContact?: string | null;
  nextAction?: string | null;
  nextActionBy?: "household" | "provider" | null;
};

export async function createServiceRequest(
  supabase: SupabaseClient,
  input: CreateServiceRequestInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      household_id: input.householdId,
      asset_id: input.assetId ?? null,
      subject: input.subject,
      provider_name: input.providerName ?? null,
      provider_contact: input.providerContact ?? null,
      next_action: input.nextAction ?? null,
      next_action_by: input.nextActionBy ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot raise a request for this household.");
    if (error.code === "23503") throw ApiError.badRequest("That asset is not part of this household.");
    throw new Error(`createServiceRequest failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

export async function listLaundryNeeds(
  supabase: SupabaseClient,
  householdId: string,
): Promise<LaundryNeed[]> {
  const { data, error } = await supabase
    .from("laundry_needs")
    .select("id, label, for_member_id, needed_by, state, state_as_of, drying_hours, requires_outdoor_drying")
    .eq("household_id", householdId)
    .order("needed_by", { ascending: true });

  if (error) throw new Error(`listLaundryNeeds failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    forMemberId: (row.for_member_id as string | null) ?? null,
    neededBy: new Date(row.needed_by as string),
    state: row.state as LaundryState,
    stateAsOf: row.state_as_of ? new Date(row.state_as_of as string) : null,
    dryingHours: Number(row.drying_hours),
    requiresOutdoorDrying: row.requires_outdoor_drying as boolean,
  }));
}

export async function listPetCareNeeds(
  supabase: SupabaseClient,
  householdId: string,
): Promise<PetCareNeed[]> {
  const { data, error } = await supabase
    .from("pet_care_needs")
    .select(
      "id, kind, interval_days, last_done_on, due_on, responsible_member_id, supply_days_remaining, pets!inner(id, name, species)",
    )
    .eq("household_id", householdId);

  if (error) throw new Error(`listPetCareNeeds failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => {
    // PostgREST types a to-one embed as an array; normalising here keeps the
    // shape the domain expects rather than leaking the client's quirk outwards.
    const embedded = (row as Row).pets as Row | Row[] | null;
    const pet = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;

    return {
      id: row.id as string,
      pet: {
        id: (pet?.id as string) ?? "",
        name: (pet?.name as string) ?? "This pet",
        species: (pet?.species as string) ?? "",
      },
      kind: row.kind as PetCareKind,
      intervalDays: (row.interval_days as number | null) ?? null,
      lastDoneOn: (row.last_done_on as string | null) ?? null,
      dueOn: (row.due_on as string | null) ?? null,
      responsibleMemberId: (row.responsible_member_id as string | null) ?? null,
      supplyDaysRemaining: (row.supply_days_remaining as number | null) ?? null,
    };
  });
}

/**
 * Pets as their own manageable entity (CLAUDE.md rule 12) — everything the
 * household has told WonderHome about one, not just what `pet_care_needs`
 * borrows for a care rhythm.
 */
export async function listPets(
  supabase: SupabaseClient,
  householdId: string,
  options?: { includeRetired?: boolean },
): Promise<Pet[]> {
  let query = supabase
    .from("pets")
    .select("id, name, species, date_of_birth, vet_name, vet_contact, notes, active")
    .eq("household_id", householdId)
    .order("name", { ascending: true });
  if (!options?.includeRetired) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw new Error(`listPets failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    name: row.name as string,
    species: row.species as string,
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    vetName: (row.vet_name as string | null) ?? null,
    vetContact: (row.vet_contact as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    active: row.active as boolean,
  }));
}

export type CreatePetInput = {
  householdId: string;
  name: string;
  species: string;
  dateOfBirth?: string | null;
  vetName?: string | null;
  vetContact?: string | null;
  notes?: string | null;
};

export async function createPet(supabase: SupabaseClient, input: CreatePetInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("pets")
    .insert({
      household_id: input.householdId,
      name: input.name,
      species: input.species,
      date_of_birth: input.dateOfBirth ?? null,
      vet_name: input.vetName ?? null,
      vet_contact: input.vetContact ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can add a pet.");
    throw new Error(`createPet failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

export type UpdatePetInput = {
  name?: string;
  species?: string;
  dateOfBirth?: string | null;
  vetName?: string | null;
  vetContact?: string | null;
  notes?: string | null;
};

export async function updatePet(
  supabase: SupabaseClient,
  householdId: string,
  petId: string,
  input: UpdatePetInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.species !== undefined) patch.species = input.species;
  if (input.dateOfBirth !== undefined) patch.date_of_birth = input.dateOfBirth;
  if (input.vetName !== undefined) patch.vet_name = input.vetName;
  if (input.vetContact !== undefined) patch.vet_contact = input.vetContact;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("pets").update(patch).eq("id", petId).eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can edit a pet's details.");
    throw new Error(`updatePet failed: ${error.code ?? "unknown"}`);
  }
}

/** The other half of adding a pet (rule 12): retiring it, never a hard delete — `pet_care_needs` keeps its history against this row. */
export async function setPetActive(
  supabase: SupabaseClient,
  householdId: string,
  petId: string,
  active: boolean,
): Promise<void> {
  const { error } = await supabase.from("pets").update({ active }).eq("id", petId).eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can retire a pet.");
    throw new Error(`setPetActive failed: ${error.code ?? "unknown"}`);
  }
}

/** A reading with the asset it concerns, which the bare domain type has no need for. */
export type AssetSignal = DeviceSignal & { assetId: string | null };

export async function recentSignals(
  supabase: SupabaseClient,
  householdId: string,
  since: Date,
): Promise<AssetSignal[]> {
  const { data, error } = await supabase
    .from("home_device_signals")
    .select("asset_id, device_key, kind, observed_at, value, confidence")
    .eq("household_id", householdId)
    .gte("observed_at", since.toISOString())
    .order("observed_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`recentSignals failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => ({
    deviceKey: row.device_key as string,
    kind: row.kind as SignalKind,
    observedAt: new Date(row.observed_at as string),
    value: Number(row.value),
    confidence: Number(row.confidence),
    assetId: (row.asset_id as string | null) ?? null,
  }));
}

export type HomeAgenda = {
  maintenance: HomeAssessment[];
  laundry: HomeAssessment[];
  pets: HomeAssessment[];
  services: HomeAssessment[];
  /**
   * How many subjects were evaluated to produce the lists above.
   *
   * Carried so a screen can say "nine things checked, one needs you" without
   * counting rows it cannot see. The difference between this and the lists is
   * the part WonderHome handled quietly, which is the number the household
   * actually cares about.
   */
  checked: number;
};

/**
 * Everything in this domain that currently needs a person, and nothing else.
 *
 * An empty agenda is the expected result for a household where things are
 * working, and the UI is expected to say so plainly rather than treat it as an
 * error or an empty list to apologise for.
 */
export async function homeAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date; forecast?: readonly WeatherWindow[]; someoneAvailable?: boolean } = {},
): Promise<HomeAgenda> {
  const now = options.now ?? new Date();
  const conditions = dryingConditions(options.forecast ?? []);

  const [assets, requests, laundry, pets, signals] = await Promise.all([
    listAssets(supabase, householdId),
    listServiceRequests(supabase, householdId),
    listLaundryNeeds(supabase, householdId),
    listPetCareNeeds(supabase, householdId),
    recentSignals(supabase, householdId, new Date(now.getTime() - 72 * 3_600_000)),
  ]);

  const open = openRequestAssetIds(requests);
  const byAsset = new Map<string, DeviceSignal[]>();
  for (const signal of signals) {
    if (!signal.assetId) continue;
    byAsset.set(signal.assetId, [...(byAsset.get(signal.assetId) ?? []), signal]);
  }

  const checked = assets.length + requests.length + laundry.length + pets.length;

  return {
    checked,
    maintenance: maintenanceAgenda(assets, {
      now,
      signalsFor: (assetId) => byAsset.get(assetId) ?? [],
      hasOpenRequest: (assetId) => open.has(assetId),
    }),
    laundry: laundry
      .map((need) =>
        assessLaundry(need, { now, conditions, someoneAvailable: options.someoneAvailable ?? true }),
      )
      .filter((assessment) => assessment.notable),
    pets: petAgenda(pets, now),
    services: requests
      .map((request) => assessServiceRequest(request, now))
      .filter((assessment) => assessment.notable),
  };
}
