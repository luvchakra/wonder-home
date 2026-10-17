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

export function isRosterQuestion(utterance: string): boolean {
  return ROSTER_QUESTION.test(utterance.trim().replace(/[.!]+$/, ""));
}

export function composeRoster(people: readonly RosterPerson[], options: { viewerMemberId: string; householdName: string; pets?: readonly RosterPet[] }): string {
  const describe = (person: RosterPerson) => {
    const goesBy = person.nickname && person.nickname.toLowerCase() !== person.displayName.split(/\s+/)[0]?.toLowerCase() ? ` (${person.nickname})` : "";
    const who = person.id === options.viewerMemberId ? "you" : person.relationship ? person.relationship.toLowerCase() : null;
    return `- **${person.displayName}**${goesBy}${who ? ` — ${who}` : ""}`;
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
  sections.push("Someone missing? Add them in [Family](/family).");
  return sections.join("\n\n");
}
