import { AMAF_FACTS, COOLDOWN_DAYS, type AmafFact, type AmafModule, type AmafSnapshot, type AmafSubject } from "./facts";

/** One question HomeTalk could ask now. */
export type AmafChoice = { fact: AmafFact; subject: AmafSubject; refresh: boolean };

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined, today: string) => (iso ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(iso.slice(0, 10) + "T00:00:00Z")) / DAY : Infinity);

/** Whether this person may change what the question fills. A child is never asked; a helper only about themselves, through an Admin. */
function mayAsk(fact: AmafFact, snapshot: AmafSnapshot, subject: AmafSubject): boolean {
  if (snapshot.speaker.memberType !== "adult") return false;
  if (fact.adminOnly && !snapshot.speaker.isAdmin) return false;
  // Someone else's own details are an Admin's to fill in, or the person's own.
  if (subject.kind === "person" && (fact.key === "member.birthday" || fact.key === "member.work" || fact.key === "member.anniversary")) {
    const person = snapshot.people.find((entry) => entry.id === subject.id);
    if (person?.memberType === "adult" && subject.id !== snapshot.speaker.memberId && !snapshot.speaker.isAdmin) return false;
  }
  return true;
}

/**
 * Every question worth asking now, best first. A missing fact outranks a
 * check on a known one (which counts half), and a fact asked about the
 * speaker themselves comes a little ahead of the same fact about someone
 * else — it is the answer they are surest of.
 */
export function candidates(snapshot: AmafSnapshot, options: { exclude?: readonly string[] } = {}): (AmafChoice & { score: number })[] {
  const out: (AmafChoice & { score: number })[] = [];
  for (const fact of AMAF_FACTS) {
    for (const subject of fact.subjects(snapshot)) {
      const id = `${fact.key}:${subject.id ?? ""}`;
      if (options.exclude?.includes(id)) continue;
      if (!mayAsk(fact, snapshot, subject)) continue;
      const last = snapshot.answered.find((entry) => entry.factKey === fact.key && entry.subjectId === subject.id);
      const cooldown = last ? COOLDOWN_DAYS[last.outcome] : null;
      if (last && cooldown !== null && daysSince(last.at, snapshot.today) < cooldown) continue;
      const stored = fact.stored(snapshot, subject);
      if (stored === null) {
        // Answered and nothing to show for it ("noted" kept as words, "none") stays answered until a refresh would ask again.
        if (last && cooldown === null && (!fact.refreshDays || daysSince(last.at, snapshot.today) < fact.refreshDays)) continue;
        out.push({ fact, subject, refresh: false, score: fact.weight + (subject.id === snapshot.speaker.memberId ? 2 : 0) });
        continue;
      }
      if (!fact.refreshDays) continue;
      const checked = [last?.at ?? null, stored.updatedAt].filter(Boolean).sort().at(-1) ?? null;
      if (daysSince(checked, snapshot.today) < fact.refreshDays) continue;
      out.push({ fact, subject, refresh: true, score: fact.weight / 2 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * The next question: the best one, never two in a row about the same part
 * of the app (a run of birthdays reads like a form), and never one already
 * asked in this run.
 */
export function nextQuestion(snapshot: AmafSnapshot, options: { lastModule?: AmafModule | null; asked?: readonly string[] } = {}): AmafChoice | null {
  const all = candidates(snapshot, { exclude: options.asked });
  if (all.length === 0) return null;
  const varied = options.lastModule ? all.find((choice) => choice.fact.module !== options.lastModule) : null;
  const pick = varied ?? all[0]!;
  return { fact: pick.fact, subject: pick.subject, refresh: pick.refresh };
}

/** How many missing facts are left to ask about — the honest count shown beside the mode. */
export function gapsLeft(snapshot: AmafSnapshot): number {
  return candidates(snapshot).filter((choice) => !choice.refresh).length;
}

/** The subject a stored question was about, found again from what WonderHome has now. */
export function subjectFor(fact: AmafFact, snapshot: AmafSnapshot, subjectId: string | null): AmafSubject | null {
  const all = fact.subjects(snapshot);
  return all.find((subject) => subject.id === subjectId) ?? (subjectId === null ? (all[0] ?? null) : null) ?? (subjectId ? personOrPet(snapshot, subjectId) : null);
}

/** A subject the question list no longer offers (its gap was just filled) is still the subject of its own follow-up. */
function personOrPet(snapshot: AmafSnapshot, id: string): AmafSubject | null {
  const person = snapshot.people.find((entry) => entry.id === id);
  if (person) return { kind: "person", id, name: person.name };
  const pet = snapshot.pets.find((entry) => entry.id === id);
  return pet ? { kind: "pet", id, name: pet.name } : null;
}
