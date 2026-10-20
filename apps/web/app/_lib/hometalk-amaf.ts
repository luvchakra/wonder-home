import type { SupabaseClient } from "@supabase/supabase-js";

import { amafMemoryKey, clashesFor, factByKey, type AmafAnswered, type AmafClash, type AmafOutcome, type AmafPerson, type AmafSection, type AmafSnapshot, type AmafSubject, type AmafValue, type DayHours, type StoredValue } from "@wonderhome/core/amaf/facts";
import { gapsLeft, nextQuestion, subjectFor, type AmafChoice } from "@wonderhome/core/amaf/plan";
import { provenanceOf, provenanceWords, type ProvenanceTrail } from "@wonderhome/core/amaf/provenance";
import { amafStep, isAmafUndo, type AmafMark, type AmafPending } from "@wonderhome/core/amaf/session";
import { ApiError } from "@wonderhome/core/api/errors";
import { nextOnDay } from "@wonderhome/core/conversation/bill-talk";
import { recordMessage, remember } from "@wonderhome/core/conversation/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { BILL_TYPE_NAMES, billType, type BillTypeKey } from "@wonderhome/core/finance/bill-catalog";
import { cancelObligation, createObligation } from "@wonderhome/core/finance/repository";
import { createPet, listPets, setPetActive, updatePet } from "@wonderhome/core/home/repository";
import { loadHouseholdAddress, saveHouseholdAddress } from "@wonderhome/core/household/address";
import { saveResponsibility } from "@wonderhome/core/household/configuration-repository";
import { replaceAvailabilityPattern } from "@wonderhome/core/household/helpers-repository";
import { calledName, isHouseholdAdmin, updateMemberProfile } from "@wonderhome/core/identity/households";
import { readMemberPhones, setMemberPhone } from "@wonderhome/core/identity/member-phone";
import { listRelationships, removeRelationship, saveRelationship } from "@wonderhome/core/identity/relationships";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { preferencesOf } from "@wonderhome/core/i18n/preferences";
import { translatorFor, type Translate, type TranslationKey } from "@wonderhome/core/i18n/translate";
import { isDiet, type Diet } from "@wonderhome/core/meals/diet";
import { createFoodPreference, removeFoodPreference, setDiet } from "@wonderhome/core/meals/repository";
import { saveActivity, saveTeacher, standDownActivity, standDownTeacher } from "@wonderhome/core/school/activities";
import { endEnrolments, saveEnrolment, setSchoolHours } from "@wonderhome/core/school/enrolments";

/**
 * Ask me about family (AMAF), on the server.
 *
 * HomeTalk asks one question at a time about the family, and each answer
 * fills the module it belongs to through that module's own service, under
 * the person's own session — RLS and every service rule apply exactly as on
 * the screen. Nothing here writes a table directly except AMAF's own record
 * of the answer (`amaf_answers`), which is also what undo and provenance
 * read. Every message's content is the English record; what the person
 * reads is kept beside it in their language, as the welcome does.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

/** What the turn hands back to the HomeTalk route. */
export type AmafTurnResult = { memberMessageId: string | null; replyId: string; text: string; amaf: AmafMark | null; navigate?: string };


function languageOf(membership: HouseholdMembership): string {
  return preferencesOf(membership.locale, membership.household.timezone).language;
}

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

const hhmm = (time: unknown): string | null => (typeof time === "string" && time ? time.slice(0, 5) : null);
const hours = (starts: unknown, ends: unknown): DayHours | null => {
  const s = hhmm(starts);
  const e = hhmm(ends);
  return s && e ? { starts: s, ends: e } : null;
};

/** Everything the questions are decided from, read in one wave through the person's own session. */
export async function loadAmafSnapshot(supabase: SupabaseClient, membership: HouseholdMembership): Promise<{ snapshot: AmafSnapshot; people: AmafPerson[]; currency: string | null }> {
  const householdId = membership.household.id;
  const isAdmin = isHouseholdAdmin(membership);
  const read = <T,>(promise: PromiseLike<{ data: T | null }>) => Promise.resolve(promise).then((result) => result.data).catch(() => null);
  const [members, phones, relationships, enrolments, teachers, activities, preferences, bills, duties, address, pets, availability, memories, answered, household] = await Promise.all([
    read<Row[]>(
      supabase
        .from("household_members")
        .select("id, display_name, nickname, nickname_preferred, member_type, date_of_birth, occupation, work_arrangement, work_starts_at, work_ends_at, special_occasion_label, special_occasion_date, updated_at")
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ),
    isAdmin ? readMemberPhones(supabase, householdId).catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>()),
    listRelationships(supabase, householdId).catch(() => []),
    read<Row[]>(supabase.from("school_enrolments").select("child_member_id, school_name, grade, starts_at, ends_at, updated_at").eq("household_id", householdId).eq("active", true)),
    read<Row[]>(supabase.from("school_teachers").select("child_member_id, role, name").eq("household_id", householdId).eq("active", true)),
    read<Row[]>(supabase.from("child_activities").select("child_member_id, name").eq("household_id", householdId).eq("active", true)),
    read<Row[]>(supabase.from("food_preferences").select("id, member_id, kind, subject, updated_at").eq("household_id", householdId).limit(500)),
    read<Row[]>(supabase.from("obligations").select("id, name, bill_type, status").eq("household_id", householdId).neq("status", "cancelled").limit(300)),
    read<Row[]>(supabase.from("responsibilities").select("outcome_key, primary_member_id, updated_at, playbook_items(name)").eq("household_id", householdId).limit(200)),
    loadHouseholdAddress(supabase, householdId).catch(() => null),
    listPets(supabase, householdId).catch(() => []),
    read<Row[]>(supabase.from("member_availability").select("member_id, day_of_week, start_time, end_time").eq("household_id", householdId).limit(500)),
    read<Row[]>(supabase.from("memories").select("key").eq("household_id", householdId).like("key", "%amaf.%").in("status", ["learned", "confirmed"]).limit(500)),
    read<Row[]>(supabase.from("amaf_answers").select("fact_key, subject_id, outcome, created_at").eq("household_id", householdId).is("undone_at", null).order("created_at", { ascending: false }).limit(500)),
    read<Row>(supabase.from("households").select("currency").eq("id", householdId).maybeSingle()),
  ]);

  const memberRows = members ?? [];
  const people: AmafSnapshot["people"] = memberRows.map((row) => ({
    id: row.id as string,
    name: calledName({ displayName: row.display_name as string, nickname: (row.nickname as string | null) ?? null, nicknamePreferred: Boolean(row.nickname_preferred) }),
    memberType: (row.member_type as AmafPerson["memberType"]) ?? "adult",
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    occupation: (row.occupation as string | null) ?? null,
    workArrangement: (row.work_arrangement as string | null) ?? null,
    workHours: hours(row.work_starts_at, row.work_ends_at),
    phone: phones.get(row.id as string) ?? null,
    specialOccasion: row.special_occasion_date ? { label: (row.special_occasion_label as string | null) ?? "", date: row.special_occasion_date as string } : null,
    updatedAt: (row.updated_at as string | null) ?? null,
  }));
  const helperWindows: AmafSnapshot["helperWindows"] = {};
  for (const row of availability ?? []) {
    const id = row.member_id as string;
    const iso = Number(row.day_of_week) === 0 ? 7 : Number(row.day_of_week);
    const entry = (helperWindows[id] ??= { days: [], hours: hours(row.start_time, row.end_time) });
    if (!entry.days.includes(iso)) entry.days.push(iso);
    entry.days.sort((a, b) => a - b);
  }
  const familyDiet = (preferences ?? []).find((row) => row.kind === "diet" && row.member_id === null)?.subject;
  const snapshot: AmafSnapshot = {
    today: todayIn(membership.household.timezone),
    speaker: { memberId: membership.memberId, isAdmin, memberType: membership.memberType as AmafPerson["memberType"] },
    people,
    relationships: relationships.map((row) => ({ memberId: row.memberId, relation: row.relation, relatedMemberId: row.relatedMemberId })),
    enrolments: (enrolments ?? []).map((row) => ({ childId: row.child_member_id as string, schoolName: row.school_name as string, grade: (row.grade as string | null) ?? null, hours: hours(row.starts_at, row.ends_at), updatedAt: (row.updated_at as string | null) ?? null })),
    teachers: (teachers ?? []).map((row) => ({ childId: row.child_member_id as string, role: row.role as string, name: row.name as string })),
    activities: (activities ?? []).map((row) => ({ childId: row.child_member_id as string, name: row.name as string })),
    familyDiet: isDiet(familyDiet) ? familyDiet : null,
    foodPreferences: (preferences ?? []).map((row) => ({ id: row.id as string, memberId: (row.member_id as string | null) ?? null, kind: row.kind as string, subject: row.subject as string, updatedAt: (row.updated_at as string | null) ?? null })),
    bills: (bills ?? []).map((row) => ({ id: row.id as string, name: row.name as string, billType: (row.bill_type as string | null) ?? null })),
    responsibilities: (duties ?? []).map((row) => {
      const item = Array.isArray(row.playbook_items) ? (row.playbook_items[0] as Row | undefined) : (row.playbook_items as Row | null);
      return { outcomeKey: row.outcome_key as string, title: (item?.name as string | undefined) ?? (row.outcome_key as string), primaryMemberId: (row.primary_member_id as string | null) ?? null, updatedAt: (row.updated_at as string | null) ?? null };
    }),
    address: address ? { text: address.formattedAddress, updatedAt: null } : null,
    pets: pets.map((pet) => ({ id: pet.id, name: pet.name, species: pet.species, dateOfBirth: pet.dateOfBirth ?? null, vetName: pet.vetName ?? null, vetContact: pet.vetContact ?? null, updatedAt: null })),
    helperWindows,
    memoryKeys: (memories ?? []).map((row) => row.key as string),
    answered: (answered ?? []).map((row): AmafAnswered => ({ factKey: row.fact_key as string, subjectId: (row.subject_id as string | null) ?? null, outcome: row.outcome as AmafOutcome, at: row.created_at as string })),
  };
  return { snapshot, people: people.map(({ id, name, memberType }) => ({ id, name, memberType })), currency: (household?.currency as string | null) ?? null };
}

// ── Words ──────────────────────────────────────────────────────────────

function sectionWords(t: Translate, section: AmafSection): string {
  return t(`amaf.section.${section.label}` as TranslationKey);
}

/** A question, in the reader's words: about the speaker themselves where the catalog has a "you" form, and asked openly for a check. */
function questionText(t: Translate, choice: { factKey: string; subject: AmafSubject; refresh: boolean; speakerId: string; billName?: string }): string {
  const fact = choice.factKey.startsWith("bill.") ? "bill" : choice.factKey;
  const self = choice.subject.kind === "person" && choice.subject.id === choice.speakerId;
  const candidates = [`amaf.q.${fact}${self ? ".you" : ""}${choice.refresh ? ".check" : ""}`, `amaf.q.${fact}${choice.refresh ? ".check" : ""}`, `amaf.q.${fact}${self ? ".you" : ""}`, `amaf.q.${fact}`];
  const values = {
    name: choice.subject.kind === "person" ? firstName(choice.subject.name) : "",
    pet: choice.subject.kind === "pet" ? choice.subject.name : "",
    duty: choice.subject.kind === "duty" ? choice.subject.name : "",
    bill: choice.billName ?? "",
  };
  for (const key of candidates) {
    const text = t(key as TranslationKey, values);
    if (text !== key) return text;
  }
  return t(`amaf.q.${fact}` as TranslationKey, values);
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function followUpText(t: Translate, slot: string, subject: AmafSubject): string {
  const key = ({ year: "amaf.f.year", grade: "amaf.f.grade", school: "amaf.f.school", days: "amaf.f.days", hours: "amaf.f.hours", details: "amaf.f.details", when: "amaf.f.when", who: "amaf.f.who" } as Record<string, string>)[slot] ?? "amaf.retry";
  return t(key as TranslationKey, { name: subject.kind === "person" ? firstName(subject.name) : (subject.name ?? "") });
}

function billNameFor(t: Translate, key: BillTypeKey): string {
  const word = t(`bills.type.${key}` as TranslationKey);
  return (word === `bills.type.${key}` ? BILL_TYPE_NAMES[key] : word).toLowerCase();
}

/** A stored value said back in words: dates as dates, diets by name. */
function storedWords(t: Translate, language: string, timezone: string, factKey: string, stored: StoredValue): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(stored.value))) return dayWords(language, timezone, String(stored.value));
  if (factKey === "household.diet" && isDiet(stored.value)) return t(`meals.diet.${stored.value}` as TranslationKey);
  return stored.shown;
}

function dayWords(language: string, timezone: string, iso: string): string {
  try {
    return new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  } catch {
    return iso.slice(0, 10);
  }
}

function valueWords(t: Translate, language: string, timezone: string, value: AmafValue): string {
  switch (value.fact) {
    case "member.birthday":
    case "pet.birthday":
      return dayWords(language, timezone, value.date);
    case "child.school":
      return value.grade ? `${value.schoolName}, ${value.grade}` : value.schoolName;
    case "child.school_hours":
      return `${value.hours.starts}–${value.hours.ends}`;
    case "member.work":
      return [value.occupation, value.hours ? `${value.hours.starts}–${value.hours.ends}` : null].filter(Boolean).join(", ");
    case "household.diet":
      return t(`meals.diet.${value.diet}` as TranslationKey);
    case "household.address":
      return value.text;
    case "child.class_teacher":
      return value.name;
    case "pet.vet":
      return [value.vetName, value.vetContact].filter(Boolean).join(", ");
    case "member.phone":
      return value.phone;
    case "duty.owner":
      return value.memberId;
    case "helper.schedule":
      return `${value.hours.starts}–${value.hours.ends}`;
    default:
      return "";
  }
}

// ── Where a stored fact came from ─────────────────────────────────────────

/** The trail for one record: AMAF's own answers, HomeSend's changes, the audit log. Read by the server, said only as a name and a day. */
async function sourceWords(admin: Admin, input: { householdId: string; factKey: string; subjectId: string | null; stored: StoredValue; people: readonly AmafPerson[]; t: Translate; language: string; timezone: string }): Promise<string> {
  const target = input.stored.recordId;
  const [amaf, homesend, audit] = await Promise.all([
    admin
      .from("amaf_answers")
      .select("member_id, created_at")
      .eq("household_id", input.householdId)
      .eq("fact_key", input.factKey)
      .in("outcome", ["saved", "changed"])
      .is("undone_at", null)
      .filter("subject_id", input.subjectId === null ? "is" : "eq", input.subjectId === null ? null : input.subjectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => (data as Row[] | null) ?? [], () => [] as Row[]),
    target
      ? admin
          .from("homesend_changes")
          .select("created_by_member_id, created_at, undone_at")
          .eq("household_id", input.householdId)
          .eq("entity_id", target)
          .order("created_at", { ascending: false })
          .limit(1)
          .then(({ data }) => (data as Row[] | null) ?? [], () => [] as Row[])
      : Promise.resolve([] as Row[]),
    target
      ? admin
          .from("audit_events")
          .select("actor_member_id, event_type, created_at")
          .eq("household_id", input.householdId)
          .eq("target_id", target)
          .order("created_at", { ascending: false })
          .limit(1)
          .then(({ data }) => (data as Row[] | null) ?? [], () => [] as Row[])
      : Promise.resolve([] as Row[]),
  ]);
  const trail: ProvenanceTrail = {
    amaf: amaf.map((row) => ({ at: row.created_at as string, byMemberId: (row.member_id as string | null) ?? null })),
    homesend: homesend.map((row) => ({ at: row.created_at as string, byMemberId: (row.created_by_member_id as string | null) ?? null, undone: Boolean(row.undone_at) })),
    audit: audit.map((row) => ({ at: row.created_at as string, eventType: row.event_type as string, byMemberId: (row.actor_member_id as string | null) ?? null })),
    recordUpdatedAt: input.stored.updatedAt,
  };
  const provenance = provenanceOf(trail, (id) => input.people.find((person) => person.id === id)?.name ?? null, input.t(`amaf.section.${input.stored.screen}` as TranslationKey));
  const words = provenanceWords(provenance, (iso) => dayWords(input.language, input.timezone, iso));
  return input.t(words.key as TranslationKey, words.values);
}

// ── Writes, each through its module's own service ─────────────────────────

type WriteResult = { recordId: string | null; undo: Record<string, unknown> | null };

class Refused extends Error {}

async function writeValue(
  supabase: SupabaseClient,
  admin: Admin,
  input: { membership: HouseholdMembership; subject: AmafSubject; value: AmafValue; factKey: string; previous: unknown; snapshot: AmafSnapshot; currency: string | null; sessionId: string; answer: string },
): Promise<WriteResult> {
  const { membership, subject, value, snapshot } = input;
  const householdId = membership.household.id;
  const personId = subject.kind === "person" ? subject.id : null;
  const person = personId ? snapshot.people.find((entry) => entry.id === personId) : null;
  const forbidden = (thrown: unknown) => {
    if (thrown instanceof ApiError && thrown.code === "forbidden") throw new Refused(thrown.message);
    throw thrown;
  };

  switch (value.fact) {
    case "member.birthday":
      await updateMemberProfile(supabase, membership, { memberId: personId!, dateOfBirth: value.date }).catch(forbidden);
      return { recordId: personId, undo: { kind: "profile", memberId: personId, fields: { dateOfBirth: person?.dateOfBirth ?? null } } };
    case "member.work": {
      const fields = {
        ...(value.occupation !== null ? { occupation: value.occupation } : {}),
        ...(value.arrangement !== null ? { workArrangement: value.arrangement } : {}),
        ...(value.hours !== null ? { workHours: value.hours } : {}),
      };
      await updateMemberProfile(supabase, membership, { memberId: personId!, ...fields }).catch(forbidden);
      return { recordId: personId, undo: { kind: "profile", memberId: personId, fields: { occupation: person?.occupation ?? null, workArrangement: person?.workArrangement ?? null, workHours: person?.workHours ?? null } } };
    }
    case "member.anniversary":
      await updateMemberProfile(supabase, membership, { memberId: personId!, specialOccasionLabel: value.label, specialOccasionDate: value.date }).catch(forbidden);
      return { recordId: personId, undo: { kind: "profile", memberId: personId, fields: { specialOccasionLabel: person?.specialOccasion?.label ?? null, specialOccasionDate: person?.specialOccasion?.date ?? null } } };
    case "member.phone": {
      const result = await setMemberPhone(supabase, membership, { memberId: personId!, phone: value.phone }).catch(forbidden);
      if (result === "taken") throw new Refused("taken");
      return { recordId: personId, undo: { kind: "phone", memberId: personId, phone: person?.phone ?? null } };
    }
    case "member.relationship": {
      const id = await saveRelationship(supabase, { householdId, memberId: personId!, relation: value.relation, relatedMemberId: membership.memberId, actorMemberId: membership.memberId }).catch(forbidden);
      return { recordId: id, undo: { kind: "relationship", id } };
    }
    case "child.school": {
      const was = input.previous as { schoolName: string; grade: string | null } | null;
      await saveEnrolment(supabase, { householdId, childMemberId: personId!, schoolName: value.schoolName, grade: value.grade, only: true }).catch(forbidden);
      return { recordId: personId, undo: { kind: "school", childMemberId: personId, was } };
    }
    case "child.school_hours":
      await setSchoolHours(supabase, { householdId, childMemberId: personId!, hours: value.hours }).catch(forbidden);
      return { recordId: personId, undo: { kind: "school_hours", childMemberId: personId, was: input.previous ?? null } };
    case "child.class_teacher": {
      // A new class teacher takes over: the one on record stands down (kept, not deleted).
      const { data: current } = await supabase.from("school_teachers").select("id, name").eq("household_id", householdId).eq("child_member_id", personId!).eq("role", "class_teacher").eq("active", true);
      for (const row of (current as Row[] | null) ?? []) await standDownTeacher(supabase, { householdId, id: row.id as string }).catch(forbidden);
      const saved = await saveTeacher(supabase, { householdId, childMemberId: personId!, role: "class_teacher", subject: null, name: value.name }).catch(forbidden);
      return { recordId: saved.id, undo: { kind: "teacher", id: saved.id, childMemberId: personId, was: ((current as Row[] | null) ?? []).map((row) => row.name as string) } };
    }
    case "child.activity": {
      const saved = await saveActivity(supabase, { householdId, childMemberId: personId!, name: value.name, kind: value.kind, days: value.days, startsAt: value.startsAt, endsAt: value.endsAt }).catch(forbidden);
      return { recordId: saved.id, undo: { kind: "activity", id: saved.id } };
    }
    case "household.diet":
      await setDiet(supabase, { householdId, memberId: null, diet: value.diet }).catch(forbidden);
      return { recordId: null, undo: { kind: "diet", was: snapshot.familyDiet } };
    case "household.allergies":
    case "member.food_likes":
    case "member.food_dislikes": {
      const rows = value.fact === "household.allergies" ? value.entries.map((entry) => ({ memberId: entry.memberId, subject: entry.food, kind: "allergy" as const })) : value.subjects.map((food) => ({ memberId: personId, subject: food, kind: value.fact === "member.food_likes" ? ("preference" as const) : ("dislike" as const) }));
      const ids: string[] = [];
      for (const row of rows) {
        const existed = snapshot.foodPreferences.some((preference) => preference.memberId === row.memberId && preference.subject.toLowerCase() === row.subject.toLowerCase());
        const saved = await createFoodPreference(supabase, { householdId, memberId: row.memberId, kind: row.kind, subject: row.subject }).catch(forbidden);
        if (!existed) ids.push(saved.id);
      }
      return { recordId: ids[0] ?? null, undo: { kind: "preferences", ids } };
    }
    case "bill": {
      const type = billType(value.billType);
      const created = await createObligation(supabase, {
        householdId,
        name: BILL_TYPE_NAMES[value.billType],
        kind: type?.kind ?? "other",
        payee: value.payee,
        amountMinor: value.amount === null ? null : Math.round(value.amount * 100),
        currency: value.amount === null ? null : (input.currency ?? "INR"),
        dueOn: value.dueDay ? nextOnDay(snapshot.today, value.dueDay) : null,
        recurrence: type?.recurrence ?? "monthly",
        billType: value.billType,
      }).catch(forbidden);
      return { recordId: created.id, undo: { kind: "bill", id: created.id } };
    }
    case "duty.owner": {
      if (subject.kind !== "duty") return { recordId: null, undo: null };
      const { data } = await supabase.from("responsibilities").select("outcome_key, primary_member_id, backup_member_id, ai_mode, priority").eq("household_id", householdId).eq("outcome_key", subject.id).maybeSingle();
      const row = data as Row | null;
      if (!row) return { recordId: null, undo: null };
      const members = snapshot.people.map((entry) => ({ id: entry.id, displayName: entry.name, memberType: entry.memberType }));
      const responsibility = { outcomeKey: subject.id, primaryMemberId: value.memberId, backupMemberId: (row.backup_member_id as string | null) === value.memberId ? null : ((row.backup_member_id as string | null) ?? null), aiMode: row.ai_mode as never, priority: Number(row.priority ?? 1) };
      await saveResponsibility(supabase, { householdId, actorMemberId: membership.memberId, members, responsibility }).catch(forbidden);
      return { recordId: subject.id, undo: { kind: "duty", responsibility: { ...responsibility, primaryMemberId: (row.primary_member_id as string | null) ?? null, backupMemberId: (row.backup_member_id as string | null) ?? null } } };
    }
    case "household.address":
      await saveHouseholdAddress(supabase, { householdId, memberId: membership.memberId, address: { typed: value.text } }).catch(forbidden);
      return { recordId: null, undo: { kind: "address", was: snapshot.address?.text ?? null } };
    case "household.pets": {
      const ids: string[] = [];
      for (const pet of value.pets) ids.push((await createPet(supabase, { householdId, name: pet.name, species: pet.species }).catch(forbidden)).id);
      return { recordId: ids[0] ?? null, undo: { kind: "pets", ids } };
    }
    case "pet.birthday": {
      const pet = snapshot.pets.find((entry) => entry.id === subject.id);
      await updatePet(supabase, householdId, subject.id!, { dateOfBirth: value.date }).catch(forbidden);
      return { recordId: subject.id, undo: { kind: "pet", id: subject.id, fields: { dateOfBirth: pet?.dateOfBirth ?? null } } };
    }
    case "pet.vet": {
      const pet = snapshot.pets.find((entry) => entry.id === subject.id);
      await updatePet(supabase, householdId, subject.id!, { ...(value.vetName ? { vetName: value.vetName } : {}), ...(value.vetContact ? { vetContact: value.vetContact } : {}) }).catch(forbidden);
      return { recordId: subject.id, undo: { kind: "pet", id: subject.id, fields: { vetName: pet?.vetName ?? null, vetContact: pet?.vetContact ?? null } } };
    }
    case "helper.schedule": {
      const was = snapshot.helperWindows[personId!] ?? null;
      const windows = value.days.map((day) => ({ dayOfWeek: day === 7 ? 0 : day, startTime: value.hours.starts, endTime: value.hours.ends }));
      await replaceAvailabilityPattern(supabase, { householdId, memberId: personId!, windows }).catch(forbidden);
      return { recordId: personId, undo: { kind: "schedule", memberId: personId, was } };
    }
    case "note": {
      // Kept as the person's own words in HomeBrain, under the subject it was about.
      await remember(
        admin,
        householdId,
        {
          scope: subject.kind === "person" ? "member" : "household",
          memberId: subject.kind === "person" ? subject.id : null,
          category: input.factKey === "note.mornings" ? "routine" : input.factKey.startsWith("note.") ? "preference" : "fact",
          key: amafMemoryKey(input.factKey, subject),
          value: { statement: `${NOTE_STATEMENT[input.factKey] ?? `About ${subject.name ?? "the family"}`}: ${value.text}`, said: value.text, topic: input.factKey },
          sourceType: "conversation",
          sourceId: input.sessionId,
          confidence: 0.9,
          status: "confirmed",
        },
        { memberId: membership.memberId, displayName: membership.displayName },
      );
      return { recordId: null, undo: null };
    }
  }
}

/** The English sentence a note is kept under, so HomeBrain can say what it is about. */
const NOTE_STATEMENT: Record<string, string> = {
  "note.together": "The family loves doing together",
  "note.festivals": "Festivals and special days the family celebrates",
  "note.eat_out": "Where the family likes to eat out or order from",
  "note.mornings": "A usual weekday morning at home",
  "note.hobbies": "Enjoys in their free time",
  "household.allergies": "About food allergies in the family",
  "member.birthday": "About a birthday",
  "member.work": "About work",
  "child.school": "About school",
  "child.school_hours": "About school timings",
  "child.activity": "About classes outside school",
  "household.address": "About the home's address",
  "helper.schedule": "About when the househelper comes",
  "pet.vet": "About the pet's vet",
};

/** Takes back the last thing AMAF wrote, through the same service, from what the record said before. */
async function undoLast(supabase: SupabaseClient, membership: HouseholdMembership): Promise<{ done: boolean; section: AmafSection | null }> {
  const householdId = membership.household.id;
  const { data } = await supabase
    .from("amaf_answers")
    .select("id, fact_key, previous, created_at")
    .eq("household_id", householdId)
    .eq("member_id", membership.memberId)
    .in("outcome", ["saved", "changed"])
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as Row | null;
  if (!row) return { done: false, section: null };
  const fact = factByKey(row.fact_key as string);
  const section = fact ? fact.section({ kind: "household", id: null, name: null }) : null;
  const undo = row.previous as Record<string, unknown> | null;
  if (!undo || Date.now() - Date.parse(row.created_at as string) > 60 * 60 * 1000) return { done: false, section };
  switch (undo.kind) {
    case "profile":
      await updateMemberProfile(supabase, membership, { memberId: undo.memberId as string, ...(undo.fields as Record<string, never>) });
      break;
    case "phone":
      await setMemberPhone(supabase, membership, { memberId: undo.memberId as string, phone: (undo.phone as string | null) ?? null });
      break;
    case "relationship":
      await removeRelationship(supabase, { householdId, id: undo.id as string });
      break;
    case "school": {
      const was = undo.was as { schoolName: string; grade: string | null } | null;
      if (was) await saveEnrolment(supabase, { householdId, childMemberId: undo.childMemberId as string, schoolName: was.schoolName, grade: was.grade, only: true });
      else await endEnrolments(supabase, { householdId, childMemberId: undo.childMemberId as string });
      break;
    }
    case "school_hours":
      await setSchoolHours(supabase, { householdId, childMemberId: undo.childMemberId as string, hours: (undo.was as DayHours | null) ?? null });
      break;
    case "teacher": {
      await standDownTeacher(supabase, { householdId, id: undo.id as string });
      for (const name of (undo.was as string[] | undefined) ?? []) await saveTeacher(supabase, { householdId, childMemberId: undo.childMemberId as string, role: "class_teacher", subject: null, name });
      break;
    }
    case "activity":
      await standDownActivity(supabase, { householdId, id: undo.id as string });
      break;
    case "diet":
      await setDiet(supabase, { householdId, memberId: null, diet: (undo.was as Diet | null) ?? null });
      break;
    case "preferences":
      for (const id of (undo.ids as string[]) ?? []) await removeFoodPreference(supabase, { householdId, id });
      break;
    case "bill":
      await cancelObligation(supabase, { householdId, id: undo.id as string });
      break;
    case "duty":
      await saveResponsibility(supabase, {
        householdId,
        actorMemberId: membership.memberId,
        members: (await loadAmafSnapshot(supabase, membership)).snapshot.people.map((entry) => ({ id: entry.id, displayName: entry.name, memberType: entry.memberType })),
        responsibility: undo.responsibility as never,
      });
      break;
    case "address":
      if (!undo.was) return { done: false, section };
      await saveHouseholdAddress(supabase, { householdId, memberId: membership.memberId, address: { typed: undo.was as string } });
      break;
    case "pets":
      for (const id of (undo.ids as string[]) ?? []) await setPetActive(supabase, householdId, id, false);
      break;
    case "pet":
      await updatePet(supabase, householdId, undo.id as string, undo.fields as never);
      break;
    case "schedule": {
      const was = undo.was as { days: number[]; hours: DayHours | null } | null;
      const windows = was?.hours ? was.days.map((day) => ({ dayOfWeek: day === 7 ? 0 : day, startTime: was.hours!.starts, endTime: was.hours!.ends })) : [];
      await replaceAvailabilityPattern(supabase, { householdId, memberId: undo.memberId as string, windows });
      break;
    }
    default:
      return { done: false, section };
  }
  await supabase.from("amaf_answers").update({ undone_at: new Date().toISOString() }).eq("id", row.id as string);
  return { done: true, section };
}

// ── The conversation ─────────────────────────────────────────────────────

async function say(admin: Admin, input: { householdId: string; sessionId: string; english: string; shown: string; language: string; pending: AmafPending | null; mark: AmafMark | null }): Promise<string> {
  return recordMessage(admin, {
    householdId: input.householdId,
    sessionId: input.sessionId,
    role: "assistant",
    content: input.english,
    metadata: {
      kind: "amaf",
      amaf: { pending: input.pending, mark: input.mark },
      ...(input.language === "en" ? {} : { localized: { language: input.language, text: input.shown, fallback: null } }),
    },
  });
}

/** What AMAF is waiting on — only when its question was the very last thing said. */
export async function pendingAmaf(admin: Admin, sessionId: string): Promise<AmafPending | null> {
  const { data } = await admin.from("conversation_messages").select("role, metadata").eq("session_id", sessionId).in("role", ["member", "assistant"]).order("created_at", { ascending: false }).limit(1);
  const row = ((data as { role: string; metadata: Record<string, unknown> | null }[] | null) ?? [])[0];
  if (!row || row.role !== "assistant") return null;
  const pending = (row.metadata?.amaf as { pending?: AmafPending | null } | undefined)?.pending;
  return pending && typeof pending === "object" && typeof (pending as { fact?: unknown }).fact === "string" ? pending : null;
}

/** The facts asked in this run of the mode (since it last started), so none comes round twice. */
async function askedThisRun(admin: Admin, sessionId: string): Promise<{ asked: string[]; saved: number; lastModule: string | null }> {
  const { data } = await admin.from("conversation_messages").select("metadata").eq("session_id", sessionId).eq("role", "assistant").order("created_at", { ascending: false }).limit(60);
  const asked: string[] = [];
  let saved = 0;
  let lastModule: string | null = null;
  for (const row of (data as { metadata: Record<string, unknown> | null }[] | null) ?? []) {
    const amaf = row.metadata?.amaf as { pending?: AmafPending | null; start?: boolean; saved?: boolean } | undefined;
    if (!amaf) break;
    if (amaf.pending) {
      const id = `${amaf.pending.fact}:${amaf.pending.subjectId ?? ""}`;
      if (!asked.includes(id)) asked.push(id);
      lastModule ??= factByKey(amaf.pending.fact)?.module ?? null;
    }
    if (amaf.saved) saved += 1;
    if (amaf.start) break;
  }
  return { asked, saved, lastModule };
}

function pendingFor(choice: AmafChoice): Extract<AmafPending, { step: "ask" }> {
  return { step: "ask", fact: choice.fact.key, subjectId: choice.subject.id, refresh: choice.refresh, slot: null, partial: {}, tries: 0 };
}

function markFor(t: Translate, choice: { fact: { section: (subject: AmafSubject) => AmafSection }; subject: AmafSubject }, left: number): AmafMark {
  const section = choice.fact.section(choice.subject);
  return { section: t("amaf.ui.fills", { section: sectionWords(t, section) }), href: section.href, left };
}

/** "Ask me about family": the opening and the first question, or why there is nothing to ask. */
export async function startAmaf(supabase: SupabaseClient, input: { membership: HouseholdMembership; sessionId: string; utterance: string; channel: "text" | "voice"; transcriptConfidence?: number }): Promise<AmafTurnResult> {
  const admin = createAdminClient();
  const { membership, sessionId } = input;
  const householdId = membership.household.id;
  const language = languageOf(membership);
  const [t, english, memberMessageId, loaded] = await Promise.all([
    translatorFor(language),
    translatorFor("en"),
    recordMessage(admin, { householdId, sessionId, role: "member", content: input.utterance, transcriptConfidence: input.transcriptConfidence, metadata: { channel: input.channel, amafStart: true } }),
    loadAmafSnapshot(supabase, membership),
  ]);
  if (membership.memberType !== "adult") {
    const replyId = await say(admin, { householdId, sessionId, english: english("amaf.start.notAdult"), shown: t("amaf.start.notAdult"), language, pending: null, mark: null });
    return { memberMessageId, replyId, text: t("amaf.start.notAdult"), amaf: null };
  }
  const choice = nextQuestion(loaded.snapshot);
  if (!choice) {
    const replyId = await say(admin, { householdId, sessionId, english: english("amaf.start.nothing"), shown: t("amaf.start.nothing"), language, pending: null, mark: null });
    return { memberMessageId, replyId, text: t("amaf.start.nothing"), amaf: null };
  }
  const left = gapsLeft(loaded.snapshot);
  const words = (tr: Translate) => `${tr("amaf.start.intro")}\n\n${questionText(tr, { factKey: choice.fact.key, subject: choice.subject, refresh: choice.refresh, speakerId: membership.memberId, billName: choice.subject.kind === "bill" ? billNameFor(tr, choice.subject.id) : undefined })}`;
  const mark = markFor(t, choice, left);
  const replyId = await recordMessage(admin, {
    householdId,
    sessionId,
    role: "assistant",
    content: words(english),
    metadata: { kind: "amaf", amaf: { pending: pendingFor(choice), mark, start: true }, ...(language === "en" ? {} : { localized: { language, text: words(t), fallback: null } }) },
  });
  return { memberMessageId, replyId, text: words(t), amaf: mark };
}

/** An answer to AMAF's waiting question: carried out, said back, and the next question — or the end. */
export async function continueAmaf(
  supabase: SupabaseClient,
  input: { membership: HouseholdMembership; sessionId: string; pending: AmafPending; answer: string; channel: "text" | "voice"; transcriptConfidence?: number },
): Promise<AmafTurnResult> {
  const admin = createAdminClient();
  const { membership, sessionId, pending } = input;
  const householdId = membership.household.id;
  const language = languageOf(membership);
  const timezone = membership.household.timezone;
  const [t, english, memberMessageId, loaded, run] = await Promise.all([
    translatorFor(language),
    translatorFor("en"),
    recordMessage(admin, { householdId, sessionId, role: "member", content: input.answer, transcriptConfidence: input.transcriptConfidence, metadata: { channel: input.channel, amafAnswer: pending.fact } }),
    loadAmafSnapshot(supabase, membership),
    askedThisRun(admin, sessionId),
  ]);
  const { snapshot, people, currency } = loaded;

  // Each part of the reply is a pair: the person's language, and the English record.
  const parts: { shown: string; english: string }[] = [];
  const add = (key: string, values: Record<string, string | number> = {}) => parts.push({ shown: t(key as TranslationKey, values), english: english(key as TranslationKey, values) });
  const addPair = (shown: string, englishText: string) => parts.push({ shown, english: englishText });
  let savedNow = false;
  let nextPending: AmafPending | null = null;
  let mark: AmafMark | null = null;
  let navigate: string | undefined;

  const record = async (factKey: string, subjectId: string | null, outcome: AmafOutcome, extra: { value?: unknown; previous?: unknown; recordId?: string | null } = {}) => {
    await supabase
      .from("amaf_answers")
      .insert({ household_id: householdId, member_id: membership.memberId, fact_key: factKey, subject_id: subjectId, outcome, value: extra.value ?? null, previous: extra.previous ?? null, record_id: extra.recordId ?? null })
      .then(
        () => undefined,
        () => undefined,
      );
  };

  if (isAmafUndo(input.answer)) {
    const undone = await undoLast(supabase, membership).catch(() => ({ done: false, section: null }));
    if (undone.done && undone.section) add("amaf.undo.done", { section: sectionWords(t, undone.section) });
    else if (undone.section) add("amaf.undo.cannot", { section: sectionWords(t, undone.section) });
    else add("amaf.undo.none");
    // The same question stays waiting.
    nextPending = pending;
    const fact = factByKey(pending.fact);
    const subject = fact ? subjectFor(fact, snapshot, pending.subjectId) : null;
    if (fact && subject) {
      parts.push({ shown: questionText(t, { factKey: fact.key, subject, refresh: pending.step === "ask" && pending.refresh, speakerId: membership.memberId, billName: subject.kind === "bill" ? billNameFor(t, subject.id) : undefined }), english: questionText(english, { factKey: fact.key, subject, refresh: pending.step === "ask" && pending.refresh, speakerId: membership.memberId, billName: subject.kind === "bill" ? billNameFor(english, subject.id) : undefined }) });
      mark = markFor(t, { fact, subject }, gapsLeft(snapshot));
    }
  } else {
    const step = amafStep({ pending, answer: input.answer, snapshot, people });
    const source = (factKey: string, subjectId: string | null, stored: StoredValue, tr: Translate) => sourceWords(admin, { householdId, factKey, subjectId, stored, people, t: tr, language: tr === english ? "en" : language, timezone });

    switch (step.kind) {
      case "stop": {
        const count = run.saved;
        if (count > 0) add("amaf.stop", { count });
        else add("amaf.stopNone");
        break;
      }
      case "gone":
        break;
      case "recorded":
        await record(step.fact, step.subject.id, step.outcome);
        add(step.outcome === "skipped" ? "amaf.ack.skipped" : step.outcome === "dont_know" ? "amaf.ack.dontKnow" : "amaf.ack.none");
        break;
      case "confirmed":
        await record(step.fact, step.subject.id, "confirmed", { recordId: step.stored.recordId });
        add("amaf.ack.confirmed");
        break;
      case "kept":
        await record(step.fact, step.subject.id, "kept");
        add("amaf.ack.kept");
        break;
      case "said_back": {
        const fact = factByKey(step.fact)!;
        const [shownSource, englishSource] = await Promise.all([source(step.fact, step.subject.id, step.stored, t), source(step.fact, step.subject.id, step.stored, english)]);
        const section = fact.section(step.subject);
        await record(step.fact, step.subject.id, "kept", { recordId: step.stored.recordId });
        addPair(
          t("amaf.saidBack", { stored: storedWords(t, language, timezone, step.fact, step.stored), source: shownSource, section: sectionWords(t, section) }),
          english("amaf.saidBack", { stored: storedWords(english, "en", timezone, step.fact, step.stored), source: englishSource, section: sectionWords(english, section) }),
        );
        break;
      }
      case "conflict": {
        // Said back with where the record came from; nothing is written until the person says which is right.
        const [shownSource, englishSource] = await Promise.all([source(step.fact, step.subject.id, step.stored, t), source(step.fact, step.subject.id, step.stored, english)]);
        const said = (tr: Translate, lang: string) => (step.value.fact === "duty.owner" ? (people.find((entry) => entry.id === (step.value as { memberId: string }).memberId)?.name ?? "") : valueWords(tr, lang, timezone, step.value));
        addPair(
          t("amaf.conflict", { stored: storedWords(t, language, timezone, step.fact, step.stored), source: shownSource, said: said(t, language) }),
          english("amaf.conflict", { stored: storedWords(english, "en", timezone, step.fact, step.stored), source: englishSource, said: said(english, "en") }),
        );
        nextPending = { step: "confirm_change", fact: step.fact, subjectId: step.subject.id, value: step.value, stored: step.stored.shown };
        const fact = factByKey(step.fact)!;
        mark = markFor(t, { fact, subject: step.subject }, gapsLeft(snapshot));
        break;
      }
      case "follow_up":
        addPair(followUpText(t, step.pending.slot ?? "", step.subject), followUpText(english, step.pending.slot ?? "", step.subject));
        nextPending = step.pending;
        mark = markFor(t, { fact: factByKey(step.pending.fact)!, subject: step.subject }, gapsLeft(snapshot));
        break;
      case "retry": {
        const fact = factByKey(step.pending.fact)!;
        const question = (tr: Translate) => questionText(tr, { factKey: fact.key, subject: step.subject, refresh: step.pending.refresh, speakerId: membership.memberId, billName: step.subject.kind === "bill" ? billNameFor(tr, step.subject.id) : undefined });
        addPair(`${t("amaf.retry")} ${question(t)}`, `${english("amaf.retry")} ${question(english)}`);
        nextPending = step.pending;
        mark = markFor(t, { fact, subject: step.subject }, gapsLeft(snapshot));
        break;
      }
      case "write": {
        const fact = factByKey(step.fact)!;
        const section = fact.section(step.subject);
        try {
          const written = await writeValue(supabase, admin, { membership, subject: step.subject, value: step.value, factKey: step.fact, previous: step.previous, snapshot, currency, sessionId, answer: input.answer });
          await record(step.fact, step.subject.id, step.outcome, { value: step.value, previous: written.undo, recordId: written.recordId });
          savedNow = step.outcome !== "noted" || true;
          if (step.outcome === "noted") add(step.value.fact === "note" && !fact.noteable ? "amaf.ack.notedFallback" : "amaf.ack.noted", { section: sectionWords(t, section) });
          else {
            add(step.outcome === "changed" ? "amaf.ack.changed" : "amaf.ack.saved", { section: sectionWords(t, section) });
            if (written.undo) add("amaf.ack.undo");
          }
          // Something else on record that the answer clashes with, said beside it — never fixed on its own.
          for (const clash of clashesFor(step.value, step.subject, snapshot)) {
            const [shownSource, englishSource] = await Promise.all([
              clashSource(admin, clash, householdId, people, t, language, timezone),
              clashSource(admin, clash, householdId, people, english, "en", timezone),
            ]);
            const who = (tr: Translate) => (clash.memberId ? (people.find((entry) => entry.id === clash.memberId)?.name ?? tr("amaf.clash.family")) : tr("amaf.clash.family"));
            addPair(t(`amaf.clash.${clash.kind}` as TranslationKey, { who: who(t), subject: clash.subject, source: shownSource }), english(`amaf.clash.${clash.kind}` as TranslationKey, { who: who(english), subject: clash.subject, source: englishSource }));
          }
        } catch (thrown) {
          if (thrown instanceof Refused) {
            await record(step.fact, step.subject.id, "refused");
            add("amaf.refused");
          } else {
            add("amaf.failed");
          }
        }
        break;
      }
    }

    // The next question, unless the person stopped or this one is still open.
    if (step.kind !== "stop" && !nextPending) {
      const fresh = savedNow ? (await loadAmafSnapshot(supabase, membership)).snapshot : snapshot;
      const asked = [...run.asked, `${pending.fact}:${pending.subjectId ?? ""}`];
      const choice = nextQuestion(fresh, { asked, lastModule: (factByKey(pending.fact)?.module ?? null) as never });
      if (choice) {
        const question = (tr: Translate) => questionText(tr, { factKey: choice.fact.key, subject: choice.subject, refresh: choice.refresh, speakerId: membership.memberId, billName: choice.subject.kind === "bill" ? billNameFor(tr, choice.subject.id) : undefined });
        addPair(question(t), question(english));
        nextPending = pendingFor(choice);
        mark = markFor(t, choice, gapsLeft(fresh));
      } else {
        add("amaf.done");
      }
    }
  }

  const shown = parts.map((part) => part.shown).join(" ");
  const englishText = parts.map((part) => part.english).join(" ");
  const replyId = await recordMessage(admin, {
    householdId,
    sessionId,
    role: "assistant",
    content: englishText,
    metadata: { kind: "amaf", amaf: { pending: nextPending, mark, saved: savedNow }, ...(language === "en" ? {} : { localized: { language, text: shown, fallback: null } }) },
  });
  return { memberMessageId, replyId, text: shown, amaf: nextPending ? mark : null, navigate };
}

async function clashSource(admin: Admin, clash: AmafClash, householdId: string, people: readonly AmafPerson[], t: Translate, language: string, timezone: string): Promise<string> {
  return sourceWords(admin, { householdId, factKey: "member.food_likes", subjectId: clash.memberId, stored: { shown: clash.subject, value: clash.subject, updatedAt: clash.updatedAt, recordId: clash.preferenceId, screen: "meals" }, people, t, language, timezone });
}

