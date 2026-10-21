/**
 * "Who is in my family?", answered from the household's own member list,
 * by rules, never by a model.
 *
 * A model answering it only sees the people its facts mention, and a child
 * with nothing on record yet would be left out. The roster is the household's
 * own record, read in full, so everyone active is named every time.
 */

export type RosterPerson = {
  id: string;
  displayName: string;
  memberType: "adult" | "child" | "helper";
  nickname?: string | null;
  relationship?: string | null;
};

export type RosterPet = { name: string; species: string | null };

/** Whether a sentence asks who the household is. */
export const ROSTER_QUESTION =
  /^(?:(?:can you |could you |please )?(?:tell me |list |name )?(?:who(?:'s| is| are) (?:in|part of) (?:my|our|the|this) (?:family|household|home|house)|who (?:all )?(?:lives|stays) (?:here|with us|in (?:my|our|the|this) (?:house|home|flat))|who are (?:all )?(?:the |my |our )?(?:family )?members(?: of (?:my|our|the|this) (?:family|household))?|who are (?:the |my |our )?(?:family|household)(?: members)?|(?:the |my |our )?(?:family|household) members|(?:about )?(?:the |my |our )?(?:family|household) members)|how many (?:people|members) (?:are )?(?:there )?in (?:my|our|the|this) (?:family|household|home|house))\??$/i;

/** Other ways people ask who the household is (HomeBrain 4.0 §3.1, the owner's report 2026-10-18). */
const ROSTER_ALSO: readonly RegExp[] = [
  // "who all live in this house", "who lives at home", "who is living here"
  /^who(?: all)? (?:is |are )?(?:lives?|living|stays?|staying)(?: (?:here|(?:in|at) (?:this|my|our|the) (?:house|home|household|flat)|at home|with (?:me|us)))?$/i,
  // "list (all) the family members", "name everyone in the family", "show me the household members"
  /^(?:list|name|show)(?: me)? (?:all )?(?:(?:of )?the |my |our )?(?:family|household) members$/i,
  /^(?:list|name)(?: me)? every(?:one|body) in (?:the|my|our|this) (?:family|household|home|house)$/i,
  // "who all are in the family", "who all is there in our family"
  /^who all (?:are |is )?(?:there )?(?:in|part of) (?:the|my|our|this) (?:family|household|home|house)$/i,
];

/** A trailing "in this household", which says nothing the question had not. */
const WHERE_TAIL = /\s+(?:in|of|at|from) (?:this|my|our|the) (?:household|home|house|family|flat)$/i;

export function isRosterQuestion(utterance: string): boolean {
  const said = utterance.trim().replace(/[.!?]+$/, "").trim();
  const shorter = said.replace(WHERE_TAIL, "");
  return [said, shorter].some((text) => ROSTER_QUESTION.test(text) || ROSTER_ALSO.some((pattern) => pattern.test(text)));
}

/**
 * "What do you know about the family?", "tell me about us" — the family as a
 * whole, the way "what do you know about Asmi?" is about her (the owner's
 * report, 2026-10-21: it was read as "what's going on?" and answered with the
 * overdue bills). Answered by the roster, each person at a glance. A bare
 * "about us" is the same question: normalise.ts takes "tell me" off first.
 */
const FAMILY_OVERVIEW =
  /^(?:(?:can|could) you )?(?:tell me (?:all |everything |more )?about|what (?:do|did|else do) you know about|what (?:can|could) you tell me about|what do you have (?:on record )?(?:about|on)|describe|about) (?:the |my |our |this )?(?:whole )?(?:family|household|us|everyone|everybody|family members|household members)(?: (?:here|at home))?$/i;

export function isFamilyOverviewQuestion(utterance: string): boolean {
  const said = utterance
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/^(?:(?:ok(?:ay)?|so|hey|and|well|hi)[,.\s]+)+/i, "")
    .trim();
  return FAMILY_OVERVIEW.test(said);
}

export type RosterOptions = {
  viewerMemberId: string;
  householdName: string;
  pets?: readonly RosterPet[];
  /** Each person at a glance (`homebrain/sleep/profiles.ts`'s `familyGlances`), for "what do you know about the family?". */
  glances?: ReadonlyMap<string, string>;
  /** What needs a person around the home, counted, for the same question: the family first, then this, with where to see it. */
  attention?: { count: number; urgent: number };
};

export function composeRoster(people: readonly RosterPerson[], options: RosterOptions): string {
  const describe = (person: RosterPerson) => {
    const goesBy = person.nickname && person.nickname.toLowerCase() !== person.displayName.split(/\s+/)[0]?.toLowerCase() ? ` (${person.nickname})` : "";
    const who = person.id === options.viewerMemberId ? "you" : person.relationship ? person.relationship.toLowerCase() : null;
    const detail = [who, options.glances?.get(person.id)].filter(Boolean).join(" · ");
    return `- **${person.displayName}**${goesBy}${detail ? ` — ${detail}` : ""}`;
  };
  const adults = people.filter((person) => person.memberType === "adult");
  const children = people.filter((person) => person.memberType === "child");
  const helpers = people.filter((person) => person.memberType === "helper");
  const family = adults.length + children.length;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const sections: string[] = [`${options.householdName ? `${options.householdName} has` : "The household has"} ${count(family, "person", "people")} in the family${helpers.length > 0 ? `, and ${count(helpers.length, "househelper", "househelpers")}` : ""}.`];
  if (adults.length > 0) sections.push(`**Adults**\n${adults.map(describe).join("\n")}`);
  if (children.length > 0) sections.push(`**Children**\n${children.map(describe).join("\n")}`);
  if (helpers.length > 0) sections.push(`**Helping at home**\n${helpers.map(describe).join("\n")}`);
  const pets = options.pets ?? [];
  if (pets.length > 0) sections.push(`And ${pets.length === 1 ? "a pet" : "the pets"}: ${pets.map((pet) => (pet.species ? `${pet.name} (${pet.species.toLowerCase()})` : pet.name)).join(", ")}.`);
  const attention = options.attention;
  if (attention) {
    sections.push(
      attention.count === 0
        ? "Around the home, nothing needs anyone right now — see [Home](/)."
        : `Around the home, ${count(attention.count, "thing needs", "things need")} someone${attention.urgent > 0 ? ` (${attention.urgent} urgent)` : ""} — see [Home](/).`,
    );
  }
  sections.push("Someone missing? Add them in [Family](/family).");
  return sections.join("\n\n");
}
