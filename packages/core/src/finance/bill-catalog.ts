import type { ObligationKind } from "./payments";

/**
 * The bills a household typically has (rule 20: a choice is picked, not
 * typed). Picking one fills in the bill's kind and how often it comes, and
 * says which payees to offer: the electricity company for where the family
 * lives, the gas company for their city, the banks for an EMI. "Something
 * else" is always there, and its name is the household's own words.
 */

export type BillRecurrence = "monthly" | "quarterly" | "yearly" | "one_off";

/** Which list of payees a bill draws from (`payees.ts`). */
export type PayeeCategory =
  | "electricity"
  | "water"
  | "piped_gas"
  | "lpg"
  | "mobile"
  | "broadband"
  | "dth"
  | "streaming"
  | "bank"
  | "card"
  | "life_insurance"
  | "health_insurance"
  | "vehicle_insurance"
  | "municipal"
  | "none";

export type BillType = {
  key: string;
  kind: ObligationKind;
  recurrence: BillRecurrence;
  payees: PayeeCategory;
};

export const BILL_TYPES = [
  { key: "electricity", kind: "utility", recurrence: "monthly", payees: "electricity" },
  { key: "water", kind: "utility", recurrence: "monthly", payees: "water" },
  { key: "piped_gas", kind: "utility", recurrence: "monthly", payees: "piped_gas" },
  { key: "lpg", kind: "utility", recurrence: "monthly", payees: "lpg" },
  { key: "rent", kind: "rent", recurrence: "monthly", payees: "none" },
  { key: "maintenance", kind: "rent", recurrence: "monthly", payees: "none" },
  { key: "mobile", kind: "subscription", recurrence: "monthly", payees: "mobile" },
  { key: "broadband", kind: "subscription", recurrence: "monthly", payees: "broadband" },
  { key: "dth", kind: "subscription", recurrence: "monthly", payees: "dth" },
  { key: "streaming", kind: "subscription", recurrence: "monthly", payees: "streaming" },
  { key: "newspaper", kind: "service", recurrence: "monthly", payees: "none" },
  { key: "gym", kind: "subscription", recurrence: "monthly", payees: "none" },
  { key: "school_fee", kind: "school_fee", recurrence: "quarterly", payees: "none" },
  { key: "tuition", kind: "school_fee", recurrence: "monthly", payees: "none" },
  { key: "home_loan", kind: "loan", recurrence: "monthly", payees: "bank" },
  { key: "car_loan", kind: "loan", recurrence: "monthly", payees: "bank" },
  { key: "personal_loan", kind: "loan", recurrence: "monthly", payees: "bank" },
  { key: "credit_card", kind: "loan", recurrence: "monthly", payees: "card" },
  { key: "life_insurance", kind: "insurance", recurrence: "yearly", payees: "life_insurance" },
  { key: "health_insurance", kind: "insurance", recurrence: "yearly", payees: "health_insurance" },
  { key: "vehicle_insurance", kind: "insurance", recurrence: "yearly", payees: "vehicle_insurance" },
  { key: "property_tax", kind: "tax", recurrence: "yearly", payees: "municipal" },
  // The owner, 2026-10-20: a budget per line item, petrol included.
  { key: "fuel", kind: "other", recurrence: "monthly", payees: "none" },
] as const satisfies readonly BillType[];

export type BillTypeKey = (typeof BILL_TYPES)[number]["key"];

export function billType(key: string | null | undefined): BillType | null {
  return BILL_TYPES.find((type) => type.key === key) ?? null;
}

/** English names, the record's words and what HomeTalk hears; the screen shows `bills.type.<key>` in the reader's language. */
export const BILL_TYPE_NAMES: Record<BillTypeKey, string> = {
  electricity: "Electricity",
  water: "Water",
  piped_gas: "Piped gas",
  lpg: "Cooking gas cylinder",
  rent: "Rent",
  maintenance: "Society maintenance",
  mobile: "Mobile",
  broadband: "Broadband",
  dth: "DTH / cable TV",
  streaming: "Streaming",
  newspaper: "Newspaper",
  gym: "Gym",
  school_fee: "School fees",
  tuition: "Tuition",
  home_loan: "Home loan EMI",
  car_loan: "Car loan EMI",
  personal_loan: "Personal loan EMI",
  credit_card: "Credit card",
  life_insurance: "Life insurance",
  health_insurance: "Health insurance",
  vehicle_insurance: "Vehicle insurance",
  property_tax: "Property tax",
  fuel: "Petrol and diesel",
};

/** Words a person uses for each type ("light bill", "EMI", "wifi"), for HomeTalk and for reading an old bill's name. */
const TYPE_WORDS: readonly [BillTypeKey, RegExp][] = [
  ["electricity", /\b(electricity|electric|light|power|bijli)\b/i],
  ["water", /\bwater\b/i],
  ["piped_gas", /\b(piped gas|png|gas pipeline|gas bill)\b/i],
  ["lpg", /\b(lpg|cylinder|cooking gas)\b/i],
  ["maintenance", /\b(maintenance|society)\b/i],
  ["rent", /\brent\b/i],
  ["mobile", /\b(mobile|phone|postpaid|prepaid)\b/i],
  ["broadband", /\b(broadband|internet|wi-?fi|fiber|fibre)\b/i],
  ["dth", /\b(dth|cable|tata play|dish ?tv)\b/i],
  ["streaming", /\b(netflix|prime video|hotstar|streaming|ott|spotify|youtube premium)\b/i],
  ["newspaper", /\b(newspaper|paper ?wala)\b/i],
  ["gym", /\bgym\b/i],
  ["tuition", /\b(tuition|coaching|classes)\b/i],
  ["school_fee", /\b(school fees?|term fees?)\b/i],
  ["home_loan", /\b(home loan|housing loan)\b/i],
  ["car_loan", /\b(car loan|vehicle loan)\b/i],
  ["personal_loan", /\bpersonal loan\b/i],
  ["credit_card", /\bcredit card\b/i],
  ["life_insurance", /\b(life insurance|lic|term plan)\b/i],
  ["health_insurance", /\b(health insurance|mediclaim)\b/i],
  ["vehicle_insurance", /\b(car insurance|bike insurance|vehicle insurance|motor insurance)\b/i],
  ["property_tax", /\bproperty tax\b/i],
  ["fuel", /\b(petrol|diesel|fuel|cng)\b/i],
];

/** The type a bill's name or a spoken phrase most plainly is, or null when nothing fits. */
export function billTypeFor(words: string): BillTypeKey | null {
  for (const [key, pattern] of TYPE_WORDS) if (pattern.test(words)) return key;
  return null;
}
