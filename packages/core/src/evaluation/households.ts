import type { Person } from "../ai/privacy";
import type { Consumable } from "../commerce/consumables";
import { buildContextItems, type ContextRecords } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { filterForViewer } from "../context/privacy";
import type { ContextScope, ContextViewer, HouseholdContextItem } from "../context/types";
import type { GroundingEnv } from "../conversation/grounding";
import { NO_REFERENCES, type FocusEntity, type ReferenceState } from "../conversation/references";
import type { FamilyEvent } from "../family/schedule";
import type { Obligation } from "../finance/payments";
import type { HealthAppointment } from "../health/appointments";
import type { HomeAsset } from "../home/assets";
import type { Pet } from "../home/pets";
import type { HouseholdMember } from "../identity/households";
import { permissionsFor } from "../identity/permissions";
import type { HouseholdRole, MemberType } from "../identity/schemas";
import type { Meal } from "../meals/meals";
import type { SchoolCommunication } from "../school/communications";
import type { SchoolItem } from "../school/items";
import type { HouseholdKey } from "./types";

/**
 * The golden households (Wave 5 §3) — synthetic, fixed, and never production
 * data. Every evaluation case runs against one of these, so a case's
 * expectation is about a household the reader can see in full here.
 *
 * All five share one clock: Wednesday 23 September 2026, 10:00 in Kolkata.
 * "Tomorrow" is Thursday 24 September; "Friday" is 25 September;
 * "Saturday" is 26 September.
 *
 * A — two parents, Asmi and Manan, a dog, a househelper (the family every
 *     earlier wave was specified against).
 * B — one adult, a cat, and bills that look alike on purpose.
 * C — three generations, with names and nicknames that overlap.
 * D — private health and restricted finance: who may see what.
 * E — three children, a busy school calendar, groceries that run out weekly.
 */

export const GOLDEN_NOW = new Date("2026-09-23T04:30:00Z");
export const GOLDEN_TIMEZONE = "Asia/Kolkata";

export type GoldenHousehold = {
  key: HouseholdKey;
  id: string;
  name: string;
  timezone: string;
  now: Date;
  members: HouseholdMember[];
  /** Every record the household has, as the context engine reads it. */
  records: ContextRecords;
  recipes: { id: string; name: string; ingredients: string[] }[];
  /** Who looks after whom — the one authority over a child's private health. */
  guardians: Record<string, string[]>;
};

// --- builders ----------------------------------------------------------------

const ROLE_FOR: Record<MemberType, HouseholdRole> = { adult: "adult", child: "child", helper: "helper" };

function member(id: string, displayName: string, memberType: MemberType, extra: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    id,
    displayName,
    memberType,
    status: "active",
    roles: [ROLE_FOR[memberType]],
    isOwner: false,
    dateOfBirth: null,
    nickname: null,
    relationship: null,
    occupation: null,
    schoolOrWorkLocation: null,
    specialOccasionLabel: null,
    specialOccasionDate: null,
    gender: null,
    notes: null,
    avatarUrl: null,
    ...extra,
  };
}

function head(id: string, displayName: string, extra: Partial<HouseholdMember> = {}): HouseholdMember {
  return member(id, displayName, "adult", { roles: ["head"], isOwner: true, ...extra });
}

function schoolItem(id: string, childMemberId: string, kind: SchoolItem["kind"], title: string, subject: string | null, dueAt: string | null): SchoolItem {
  return {
    id, childMemberId, kind, title, subject, detail: null, dueAt: dueAt ? new Date(dueAt) : null,
    dueTimeKnown: Boolean(dueAt && !dueAt.includes("T00:00:00")), endsAt: null,
    estimatedMinutes: null, estimateSource: null, status: "pending", completedAt: null, provider: null, externalId: null,
  };
}

function event(id: string, title: string, participants: string[], startsAt: string, extra: Partial<FamilyEvent> = {}): FamilyEvent {
  const start = new Date(startsAt);
  return {
    id, title, kind: "school_event", startsAt: start, endsAt: new Date(start.getTime() + 2 * 3_600_000), protected: false,
    ownerMemberId: null, status: "confirmed", actionState: null, actionDueAt: null,
    participants: participants.map((memberId) => ({ memberId, response: "yes" as const, required: true })),
    ...extra,
  };
}

function consumable(id: string, name: string, extra: Partial<Consumable> = {}): Consumable {
  return {
    id, name, category: "grocery", petId: null, unit: "packet", typicalQuantity: 1, daysPerUnit: 7,
    evidenceBasis: "member_stated", lastPurchasedOn: "2026-09-20", lastPurchasedQuantity: 1, ...extra,
  };
}

function bill(id: string, name: string, dueOn: string, amount: number, responsibleMemberId: string, extra: Partial<Obligation> = {}): Obligation {
  return {
    id, name, kind: "utility", payee: null, amountMinor: Math.round(amount * 100), currency: "INR", dueOn,
    responsibleMemberId, status: "received", requiresReview: false, ...extra,
  };
}

function appointment(id: string, householdId: string, memberId: string, startsAt: string, extra: Partial<HealthAppointment> = {}): HealthAppointment {
  return {
    id, householdId, memberId, appointmentType: "doctor", status: "confirmed", privacyScope: "private", startsAt, endsAt: null,
    provider: null, facility: null, location: null, preparationNotes: null, notes: null, remindAdvance: true, remindPreparation: false,
    remindDayOf: true, calendarSync: false, familyEventId: null, rescheduledFromId: null, checkupId: null, createdByMemberId: memberId,
    createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", ...extra,
  };
}

function asset(id: string, name: string, category: HomeAsset["category"], responsibleMemberId: string | null): HomeAsset {
  return { id, name, category, location: null, serviceIntervalDays: 180, lastServicedOn: "2026-06-01", warrantyExpiresOn: null, amcExpiresOn: null, responsibleMemberId, status: "active" };
}

function pet(id: string, name: string, species: string): Pet {
  return { id, name, species, active: true };
}

function meal(id: string, name: string, onDate: string, slot: Meal["slot"], cookMemberId: string | null, readyBy: string): Meal {
  return { id, name, slot, onDate, readyBy: new Date(readyBy), cookMemberId, status: "planned", readyAt: null, recipe: null, ingredients: [] };
}

// --- A: the Mehtas ------------------------------------------------------------

const A_ID = "a0000000-0000-4000-8000-00000000000a";
const A_MEMBERS = [
  head("a-kunal", "Kunal Mehta", { relationship: "Father", dateOfBirth: "1985-02-11" }),
  member("a-upasana", "Upasana Mehta", "adult", { relationship: "Mother", dateOfBirth: "1987-06-03" }),
  member("a-asmi", "Asmi", "child", { relationship: "Daughter", dateOfBirth: "2015-04-10" }),
  member("a-manan", "Manan", "child", { relationship: "Son", dateOfBirth: "2018-08-02" }),
  member("a-sunita", "Sunita", "helper", { occupation: "Cook" }),
];

const HOUSEHOLD_A: GoldenHousehold = {
  key: "A",
  id: A_ID,
  name: "Mehta Home",
  timezone: GOLDEN_TIMEZONE,
  now: GOLDEN_NOW,
  members: A_MEMBERS,
  guardians: { "a-asmi": ["a-kunal", "a-upasana"], "a-manan": ["a-kunal", "a-upasana"] },
  recipes: [
    { id: "a-r-pasta", name: "Tomato pasta", ingredients: ["pasta", "tomatoes", "basil"] },
    { id: "a-r-dal", name: "Dal tadka", ingredients: ["toor dal", "ghee", "cumin"] },
  ],
  records: {
    members: A_MEMBERS,
    pets: [pet("a-bruno", "Bruno", "dog")],
    responsibilities: [
      { outcomeKey: "groceries.stocked", primaryMemberId: "a-kunal", backupMemberId: "a-upasana", aiMode: "prepare", priority: 1 },
      { outcomeKey: "bills.paid", primaryMemberId: "a-kunal", backupMemberId: null, aiMode: "approve", priority: 2 },
    ],
    schoolItems: [
      schoolItem("a-s-maths", "a-asmi", "homework", "Maths worksheet", "Maths", "2026-09-24T12:30:00Z"),
      schoolItem("a-s-science", "a-manan", "project", "Science project", "Science", "2026-09-29T11:30:00Z"),
      schoolItem("a-s-english", "a-manan", "homework", "English worksheet", "English", null),
    ],
    events: [
      event("a-e-sports", "Sports Day", ["a-asmi"], "2026-09-26T03:30:00Z"),
      event("a-e-karate", "Karate", ["a-manan"], "2026-09-24T11:30:00Z", { kind: "outing" }),
    ],
    consumables: [
      consumable("a-c-milk", "Milk", { unit: "litre", daysPerUnit: 1, lastPurchasedOn: "2026-09-21", lastPurchasedQuantity: 2 }),
      consumable("a-c-atta", "Atta", { unit: "kg", daysPerUnit: 20, lastPurchasedOn: "2026-09-01", lastPurchasedQuantity: 5 }),
      consumable("a-c-bananas", "Bananas", { unit: "dozen", daysPerUnit: 4 }),
    ],
    meals: [meal("a-m-dinner", "Pasta arrabbiata", "2026-09-23", "dinner", "a-sunita", "2026-09-23T14:30:00Z")],
    obligations: [
      bill("a-b-electricity", "Electricity", "2026-09-25", 2840, "a-kunal", { payee: "City Power" }),
      bill("a-b-internet", "Internet", "2026-10-10", 999, "a-kunal"),
    ],
    healthAppointments: [appointment("a-h-kunal", A_ID, "a-kunal", "2026-09-25T05:30:00Z", { appointmentType: "dentist", provider: "Dr. Rao" })],
    assets: [asset("a-a-washer", "Washing machine", "appliance", "a-kunal"), asset("a-a-fridge", "Fridge", "appliance", "a-kunal")],
  },
};

// --- B: one adult, a cat, bills that look alike --------------------------------

const B_ID = "b0000000-0000-4000-8000-00000000000b";
const B_MEMBERS = [head("b-arjun", "Arjun Rao", { dateOfBirth: "1990-01-05" })];

const HOUSEHOLD_B: GoldenHousehold = {
  key: "B",
  id: B_ID,
  name: "Arjun's flat",
  timezone: GOLDEN_TIMEZONE,
  now: GOLDEN_NOW,
  members: B_MEMBERS,
  guardians: {},
  recipes: [],
  records: {
    members: B_MEMBERS,
    pets: [pet("b-misty", "Misty", "cat")],
    obligations: [
      bill("b-b-power-flat", "Electricity — flat", "2026-09-26", 1840, "b-arjun", { payee: "City Power" }),
      bill("b-b-power-studio", "Electricity — studio", "2026-09-28", 3120, "b-arjun", { payee: "City Power" }),
      bill("b-b-rent", "Rent", "2026-10-01", 32000, "b-arjun", { kind: "rent" }),
      bill("b-b-card", "Credit card", "2026-10-04", 18450.5, "b-arjun", { kind: "other" }),
      bill("b-b-insurance", "Health insurance premium", "2026-10-15", 9600, "b-arjun", { kind: "insurance" }),
    ],
    consumables: [consumable("b-c-catfood", "Cat food", { category: "pet_supplies", petId: "b-misty", unit: "bag", daysPerUnit: 20 })],
  },
};

// --- C: three generations -----------------------------------------------------

const C_ID = "c0000000-0000-4000-8000-00000000000c";
const C_MEMBERS = [
  head("c-ravi", "Ravi Iyer", { relationship: "Son" }),
  member("c-priya", "Priya Iyer", "adult", { relationship: "Daughter-in-law" }),
  member("c-priyanka", "Priyanka", "adult", { relationship: "Sister", nickname: "Pinky" }),
  member("c-lakshmi", "Lakshmi Iyer", "adult", { relationship: "Mother", nickname: "Paati", dateOfBirth: "1952-03-14" }),
  member("c-venkat", "Venkat Iyer", "adult", { relationship: "Father", nickname: "Thatha", dateOfBirth: "1949-11-02" }),
  member("c-anu", "Anu", "child", { relationship: "Daughter", dateOfBirth: "2019-07-21" }),
];

const HOUSEHOLD_C: GoldenHousehold = {
  key: "C",
  id: C_ID,
  name: "Iyer House",
  timezone: GOLDEN_TIMEZONE,
  now: GOLDEN_NOW,
  members: C_MEMBERS,
  guardians: { "c-anu": ["c-ravi", "c-priya"] },
  recipes: [],
  records: {
    members: C_MEMBERS,
    schoolItems: [schoolItem("c-s-drawing", "c-anu", "homework", "Drawing homework", "Art", "2026-09-24T09:00:00Z")],
    events: [event("c-e-temple", "Temple visit", ["c-lakshmi", "c-venkat"], "2026-09-26T01:30:00Z", { kind: "outing" })],
    healthAppointments: [appointment("c-h-venkat", C_ID, "c-venkat", "2026-09-24T04:30:00Z", { appointmentType: "specialist", privacyScope: "household_operational" })],
  },
};

// --- D: privacy -----------------------------------------------------------------

const D_ID = "d0000000-0000-4000-8000-00000000000d";
const D_MEMBERS = [
  head("d-neha", "Neha Kapoor"),
  member("d-rohan", "Rohan Kapoor", "adult"),
  member("d-kabir", "Kabir", "child", { dateOfBirth: "2012-05-30" }),
  member("d-meena", "Meena", "helper", { occupation: "Househelper" }),
];

const HOUSEHOLD_D: GoldenHousehold = {
  key: "D",
  id: D_ID,
  name: "Kapoor Residence",
  timezone: GOLDEN_TIMEZONE,
  now: GOLDEN_NOW,
  members: D_MEMBERS,
  guardians: { "d-kabir": ["d-neha"] },
  recipes: [],
  records: {
    members: D_MEMBERS,
    healthAppointments: [
      appointment("d-h-neha", D_ID, "d-neha", "2026-09-24T06:00:00Z", { appointmentType: "specialist", provider: "Dr. Mehra", notes: "follow-up on test results" }),
      appointment("d-h-kabir", D_ID, "d-kabir", "2026-09-25T10:30:00Z", { appointmentType: "mental_wellness", provider: "Dr. Sen" }),
    ],
    obligations: [bill("d-b-school-fees", "School fees", "2026-09-30", 85000, "d-neha", { kind: "school_fee" })],
    consumables: [consumable("d-c-milk", "Milk", { unit: "litre", daysPerUnit: 1 })],
  },
};

// --- E: three children, a busy calendar ---------------------------------------------

const E_ID = "e0000000-0000-4000-8000-00000000000e";
const E_MEMBERS = [
  head("e-simran", "Simran Singh"),
  member("e-harpreet", "Harpreet Singh", "adult"),
  member("e-ishaan", "Ishaan", "child", { dateOfBirth: "2016-02-02" }),
  member("e-tara", "Tara", "child", { dateOfBirth: "2018-06-19" }),
  member("e-veer", "Veer", "child", { dateOfBirth: "2021-01-08" }),
];

const HOUSEHOLD_E: GoldenHousehold = {
  key: "E",
  id: E_ID,
  name: "Singh Family",
  timezone: GOLDEN_TIMEZONE,
  now: GOLDEN_NOW,
  members: E_MEMBERS,
  guardians: { "e-ishaan": ["e-simran", "e-harpreet"], "e-tara": ["e-simran", "e-harpreet"], "e-veer": ["e-simran", "e-harpreet"] },
  recipes: [],
  records: {
    members: E_MEMBERS,
    schoolItems: [
      schoolItem("e-s-ishaan-maths", "e-ishaan", "homework", "Maths worksheet", "Maths", "2026-09-24T09:00:00Z"),
      schoolItem("e-s-tara-maths", "e-tara", "homework", "Maths worksheet", "Maths", "2026-09-25T09:00:00Z"),
      schoolItem("e-s-ishaan-exam", "e-ishaan", "exam", "Hindi test", "Hindi", "2026-09-28T04:00:00Z"),
      schoolItem("e-s-tara-project", "e-tara", "project", "Solar system model", "Science", "2026-09-30T04:00:00Z"),
    ],
    events: [
      event("e-e-football", "Football practice", ["e-ishaan"], "2026-09-24T11:00:00Z", { kind: "outing" }),
      event("e-e-piano", "Piano lesson", ["e-tara"], "2026-09-24T12:00:00Z", { kind: "outing" }),
      event("e-e-ptm", "Parent-teacher meeting", ["e-simran"], "2026-09-25T05:00:00Z"),
    ],
    consumables: [
      consumable("e-c-milk", "Milk", { unit: "litre", daysPerUnit: 1, lastPurchasedQuantity: 3 }),
      consumable("e-c-bread", "Bread", { unit: "loaf", daysPerUnit: 2 }),
      consumable("e-c-eggs", "Eggs", { unit: "dozen", daysPerUnit: 5 }),
      consumable("e-c-cornflakes", "Cornflakes", { unit: "box", daysPerUnit: 10 }),
    ],
    communications: [
      {
        id: "e-n-tshirt",
        childMemberId: "e-ishaan",
        receivedAt: new Date("2026-09-22T08:00:00Z"),
        subject: "Sports Day",
        summary: "Sports Day on Saturday; children wear a white T-shirt.",
        requiresAction: true,
        actionLabel: "Send a white T-shirt",
        actionDueAt: new Date("2026-09-26T03:00:00Z"),
      } satisfies SchoolCommunication,
    ],
  },
};

export const GOLDEN_HOUSEHOLDS: Record<HouseholdKey, GoldenHousehold> = {
  A: HOUSEHOLD_A,
  B: HOUSEHOLD_B,
  C: HOUSEHOLD_C,
  D: HOUSEHOLD_D,
  E: HOUSEHOLD_E,
};

// --- what each surface is given ----------------------------------------------

export function memberOf(household: GoldenHousehold, memberId: string): HouseholdMember {
  const found = household.members.find((m) => m.id === memberId);
  if (!found) throw new Error(`Golden household ${household.key} has no member ${memberId}`);
  return found;
}

/** Who a member is to the context engine — their real permissions, not a test's guess at them. */
export function viewerFor(household: GoldenHousehold, memberId: string): ContextViewer {
  const who = memberOf(household, memberId);
  return {
    memberId,
    permissions: [...permissionsFor({ roles: who.roles, memberType: who.memberType })],
    tone: who.memberType === "child" ? "child" : who.memberType === "helper" ? "helper" : "adult",
    guardianOf: Object.entries(household.guardians).filter(([, adults]) => adults.includes(memberId)).map(([child]) => child),
  };
}

/** Every fact a member may see, as the viewer-filtered context snapshot production builds. */
export function contextItemsFor(household: GoldenHousehold, memberId: string): HouseholdContextItem[] {
  const scope: ContextScope = { householdId: household.id, householdName: household.name, timezone: household.timezone, now: household.now, viewer: viewerFor(household, memberId) };
  const built = applyFreshness(
    buildContextItems(household.records, { householdId: household.id, householdName: household.name, timezone: household.timezone, now: household.now, viewerMemberId: memberId }),
    household.now,
  );
  return filterForViewer(built, scope).items;
}

export type FocusSpec = { entityType: string; entityId: string | null; label: string; minutesAgo: number };
export type ReferenceSpec = { proposal?: FocusSpec[]; conversation?: FocusSpec[]; homesend?: FocusSpec[] };

function focusOf(household: GoldenHousehold, spec: FocusSpec, source: FocusEntity["source"]): FocusEntity {
  return { entityType: spec.entityType, entityId: spec.entityId, label: spec.label, source, at: new Date(household.now.getTime() - spec.minutesAgo * 60_000).toISOString() };
}

/** What HomeTalk's grounding reads for this household, as the conversation route assembles it. */
export function groundingEnvFor(household: GoldenHousehold, memberId: string, references: ReferenceSpec = {}): GroundingEnv {
  const state: ReferenceState = {
    ...NO_REFERENCES,
    proposal: (references.proposal ?? []).map((spec) => focusOf(household, spec, "proposal")),
    conversation: (references.conversation ?? []).map((spec) => focusOf(household, spec, "mention")),
    homesend: (references.homesend ?? []).map((spec) => focusOf(household, spec, "homesend")),
  };
  const people = buildContextItems({ members: household.members }, { householdId: household.id, householdName: household.name, timezone: household.timezone, now: household.now, viewerMemberId: memberId });
  return {
    people,
    viewerMemberId: memberId,
    timezone: household.timezone,
    now: household.now,
    references: async () => state,
    recipes: async () => household.recipes.map(({ id, name }) => ({ id, name })),
    ingredients: async (of) => household.recipes.find((recipe) => recipe.id === of.recipeId)?.ingredients ?? [],
    schoolItems: async () =>
      (household.records.schoolItems ?? [])
        .filter((item) => item.status === "pending")
        .map((item) => ({ id: item.id, title: item.title, childMemberId: item.childMemberId, dueAt: item.dueAt ? item.dueAt.toISOString() : null, status: item.status, dueTimeKnown: item.dueTimeKnown, endsAt: item.endsAt ? item.endsAt.toISOString() : null })),
    assets: async () => (household.records.assets ?? []).filter((a) => a.status === "active").map((a) => ({ id: a.id, name: a.name })),
  };
}

/** The household's people, as the consent gate names them. */
export function peopleOf(household: GoldenHousehold): Person[] {
  return household.members.map((m) => ({ id: m.id, displayName: m.displayName, memberType: m.memberType }));
}

/** Member id → display name, as HomeSend's reconciliation names who a record is for. */
export function memberNames(household: GoldenHousehold): Map<string, string> {
  return new Map(household.members.map((m) => [m.id, m.displayName]));
}
