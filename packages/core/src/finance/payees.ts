import type { PayeeCategory } from "./bill-catalog";

/**
 * Who a household in India usually pays, by where they live (the owner,
 * 2026-10-20: "the payee options can be populated based on home location").
 *
 * The home is read from the address an Admin saved (`household_addresses`,
 * a Google-formatted line such as "…, Bengaluru, Karnataka 560001, India"):
 * its state and city are matched by name, never guessed from coordinates.
 * The electricity, water, gas and property-tax payees are offered for that
 * state or city first; banks, insurers, telecom and the rest are national.
 * The list is a choice to start from, never a limit: a payee that isn't here
 * is typed once and offered again from the household's own bills.
 */

export type Payee = {
  name: string;
  category: PayeeCategory;
  /** The states it serves; absent means anywhere in India. */
  states?: readonly string[];
  /** The cities it serves, inside those states. */
  cities?: readonly string[];
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Chandigarh", "Puducherry", "Jammu and Kashmir", "Ladakh",
] as const;

/** Other spellings a formatted address uses for a state. */
const STATE_ALIASES: readonly [string, string][] = [
  ["New Delhi", "Delhi"],
  ["NCT of Delhi", "Delhi"],
  ["Orissa", "Odisha"],
  ["Pondicherry", "Puducherry"],
  ["Jammu & Kashmir", "Jammu and Kashmir"],
];

/** Cities with their own payees, and the state each is in. */
const CITIES: readonly [string, string, readonly string[]][] = [
  ["Mumbai", "Maharashtra", ["Bombay", "Navi Mumbai", "Thane"]],
  ["Pune", "Maharashtra", ["Pimpri", "Chinchwad"]],
  ["Delhi", "Delhi", ["New Delhi"]],
  ["Noida", "Uttar Pradesh", ["Greater Noida"]],
  ["Ghaziabad", "Uttar Pradesh", []],
  ["Lucknow", "Uttar Pradesh", []],
  ["Gurugram", "Haryana", ["Gurgaon"]],
  ["Faridabad", "Haryana", []],
  ["Bengaluru", "Karnataka", ["Bangalore"]],
  ["Mysuru", "Karnataka", ["Mysore"]],
  ["Mangaluru", "Karnataka", ["Mangalore"]],
  ["Hyderabad", "Telangana", ["Secunderabad"]],
  ["Chennai", "Tamil Nadu", ["Madras"]],
  ["Kolkata", "West Bengal", ["Calcutta", "Howrah"]],
  ["Ahmedabad", "Gujarat", ["Gandhinagar"]],
  ["Surat", "Gujarat", []],
  ["Vadodara", "Gujarat", ["Baroda"]],
  ["Jaipur", "Rajasthan", []],
  ["Chandigarh", "Chandigarh", []],
];

export const PAYEES: readonly Payee[] = [
  // Electricity: the distribution company for the state, and a city's own where it has one.
  { name: "Adani Electricity Mumbai", category: "electricity", states: ["Maharashtra"], cities: ["Mumbai"] },
  { name: "Tata Power (Mumbai)", category: "electricity", states: ["Maharashtra"], cities: ["Mumbai"] },
  { name: "BEST Undertaking", category: "electricity", states: ["Maharashtra"], cities: ["Mumbai"] },
  { name: "MSEDCL (Mahavitaran)", category: "electricity", states: ["Maharashtra"] },
  { name: "BSES Rajdhani", category: "electricity", states: ["Delhi"] },
  { name: "BSES Yamuna", category: "electricity", states: ["Delhi"] },
  { name: "Tata Power-DDL", category: "electricity", states: ["Delhi"] },
  { name: "NDMC", category: "electricity", states: ["Delhi"] },
  { name: "BESCOM", category: "electricity", states: ["Karnataka"], cities: ["Bengaluru"] },
  { name: "CESC Mysore", category: "electricity", states: ["Karnataka"], cities: ["Mysuru"] },
  { name: "MESCOM", category: "electricity", states: ["Karnataka"], cities: ["Mangaluru"] },
  { name: "HESCOM", category: "electricity", states: ["Karnataka"] },
  { name: "GESCOM", category: "electricity", states: ["Karnataka"] },
  { name: "TNPDCL (TANGEDCO)", category: "electricity", states: ["Tamil Nadu"] },
  { name: "TGSPDCL", category: "electricity", states: ["Telangana"] },
  { name: "TGNPDCL", category: "electricity", states: ["Telangana"] },
  { name: "APSPDCL", category: "electricity", states: ["Andhra Pradesh"] },
  { name: "APEPDCL", category: "electricity", states: ["Andhra Pradesh"] },
  { name: "APCPDCL", category: "electricity", states: ["Andhra Pradesh"] },
  { name: "KSEB", category: "electricity", states: ["Kerala"] },
  { name: "Torrent Power", category: "electricity", states: ["Gujarat"], cities: ["Ahmedabad", "Surat"] },
  { name: "UGVCL", category: "electricity", states: ["Gujarat"] },
  { name: "MGVCL", category: "electricity", states: ["Gujarat"] },
  { name: "PGVCL", category: "electricity", states: ["Gujarat"] },
  { name: "DGVCL", category: "electricity", states: ["Gujarat"] },
  { name: "CESC", category: "electricity", states: ["West Bengal"], cities: ["Kolkata"] },
  { name: "WBSEDCL", category: "electricity", states: ["West Bengal"] },
  { name: "UPPCL", category: "electricity", states: ["Uttar Pradesh"] },
  { name: "NPCL (Noida Power)", category: "electricity", states: ["Uttar Pradesh"], cities: ["Noida"] },
  { name: "DHBVN", category: "electricity", states: ["Haryana"] },
  { name: "UHBVN", category: "electricity", states: ["Haryana"] },
  { name: "PSPCL", category: "electricity", states: ["Punjab"] },
  { name: "Jaipur Vidyut Vitran Nigam (JVVNL)", category: "electricity", states: ["Rajasthan"] },
  { name: "Ajmer Vidyut Vitran Nigam (AVVNL)", category: "electricity", states: ["Rajasthan"] },
  { name: "Jodhpur Vidyut Vitran Nigam (JdVVNL)", category: "electricity", states: ["Rajasthan"] },
  { name: "MP Paschim Kshetra Vidyut Vitaran", category: "electricity", states: ["Madhya Pradesh"] },
  { name: "MP Madhya Kshetra Vidyut Vitaran", category: "electricity", states: ["Madhya Pradesh"] },
  { name: "MP Poorv Kshetra Vidyut Vitaran", category: "electricity", states: ["Madhya Pradesh"] },
  { name: "NBPDCL", category: "electricity", states: ["Bihar"] },
  { name: "SBPDCL", category: "electricity", states: ["Bihar"] },
  { name: "TP Central Odisha (TPCODL)", category: "electricity", states: ["Odisha"] },
  { name: "TP Southern Odisha (TPSODL)", category: "electricity", states: ["Odisha"] },
  { name: "TP Western Odisha (TPWODL)", category: "electricity", states: ["Odisha"] },
  { name: "TP Northern Odisha (TPNODL)", category: "electricity", states: ["Odisha"] },
  { name: "Goa Electricity Department", category: "electricity", states: ["Goa"] },
  { name: "JBVNL", category: "electricity", states: ["Jharkhand"] },
  { name: "APDCL", category: "electricity", states: ["Assam"] },
  { name: "UPCL", category: "electricity", states: ["Uttarakhand"] },
  { name: "HPSEBL", category: "electricity", states: ["Himachal Pradesh"] },
  { name: "CSPDCL", category: "electricity", states: ["Chhattisgarh"] },
  { name: "Chandigarh Electricity Department", category: "electricity", states: ["Chandigarh"] },
  { name: "JKPDD", category: "electricity", states: ["Jammu and Kashmir"] },
  { name: "Puducherry Electricity Department", category: "electricity", states: ["Puducherry"] },

  // Water: the city's board or corporation.
  { name: "BMC (MCGM) Water", category: "water", states: ["Maharashtra"], cities: ["Mumbai"] },
  { name: "Pune Municipal Corporation Water", category: "water", states: ["Maharashtra"], cities: ["Pune"] },
  { name: "Delhi Jal Board", category: "water", states: ["Delhi"] },
  { name: "BWSSB", category: "water", states: ["Karnataka"], cities: ["Bengaluru"] },
  { name: "HMWSSB", category: "water", states: ["Telangana"], cities: ["Hyderabad"] },
  { name: "CMWSSB (Chennai Metrowater)", category: "water", states: ["Tamil Nadu"], cities: ["Chennai"] },
  { name: "Kolkata Municipal Corporation Water", category: "water", states: ["West Bengal"], cities: ["Kolkata"] },
  { name: "Ahmedabad Municipal Corporation Water", category: "water", states: ["Gujarat"], cities: ["Ahmedabad"] },
  { name: "Kerala Water Authority", category: "water", states: ["Kerala"] },
  { name: "Gurugram Metropolitan Development Authority", category: "water", states: ["Haryana"], cities: ["Gurugram"] },
  { name: "Noida Authority Water", category: "water", states: ["Uttar Pradesh"], cities: ["Noida"] },
  { name: "Jaipur PHED", category: "water", states: ["Rajasthan"], cities: ["Jaipur"] },

  // Piped gas: the city gas distributor.
  { name: "Mahanagar Gas (MGL)", category: "piped_gas", states: ["Maharashtra"], cities: ["Mumbai"] },
  { name: "Maharashtra Natural Gas (MNGL)", category: "piped_gas", states: ["Maharashtra"], cities: ["Pune"] },
  { name: "Indraprastha Gas (IGL)", category: "piped_gas", states: ["Delhi", "Uttar Pradesh", "Haryana"], cities: ["Delhi", "Noida", "Ghaziabad", "Gurugram"] },
  { name: "Adani Total Gas", category: "piped_gas", states: ["Gujarat", "Haryana"], cities: ["Ahmedabad", "Vadodara", "Faridabad"] },
  { name: "Gujarat Gas", category: "piped_gas", states: ["Gujarat"] },
  { name: "Torrent Gas", category: "piped_gas", states: ["Tamil Nadu", "Uttar Pradesh", "Rajasthan", "Maharashtra"] },
  { name: "GAIL Gas", category: "piped_gas", states: ["Karnataka", "Uttar Pradesh"], cities: ["Bengaluru"] },
  { name: "Bhagyanagar Gas", category: "piped_gas", states: ["Telangana", "Andhra Pradesh"], cities: ["Hyderabad"] },
  { name: "Green Gas", category: "piped_gas", states: ["Uttar Pradesh"], cities: ["Lucknow"] },
  { name: "Think Gas", category: "piped_gas", states: ["Punjab", "Bihar", "Madhya Pradesh"] },

  // Cooking gas cylinders, anywhere.
  { name: "Indane", category: "lpg" },
  { name: "Bharat Gas", category: "lpg" },
  { name: "HP Gas", category: "lpg" },

  // Mobile, broadband, TV and streaming, anywhere.
  { name: "Jio", category: "mobile" },
  { name: "Airtel", category: "mobile" },
  { name: "Vi (Vodafone Idea)", category: "mobile" },
  { name: "BSNL", category: "mobile" },
  { name: "JioFiber", category: "broadband" },
  { name: "Airtel Xstream Fiber", category: "broadband" },
  { name: "ACT Fibernet", category: "broadband" },
  { name: "Hathway", category: "broadband" },
  { name: "BSNL Bharat Fibre", category: "broadband" },
  { name: "Tata Play Fiber", category: "broadband" },
  { name: "Excitel", category: "broadband" },
  { name: "Tata Play", category: "dth" },
  { name: "Airtel Digital TV", category: "dth" },
  { name: "Dish TV", category: "dth" },
  { name: "d2h", category: "dth" },
  { name: "Sun Direct", category: "dth" },
  { name: "Netflix", category: "streaming" },
  { name: "Amazon Prime", category: "streaming" },
  { name: "JioHotstar", category: "streaming" },
  { name: "SonyLIV", category: "streaming" },
  { name: "ZEE5", category: "streaming" },
  { name: "YouTube Premium", category: "streaming" },
  { name: "Spotify", category: "streaming" },

  // Loans and cards.
  { name: "SBI", category: "bank" },
  { name: "HDFC Bank", category: "bank" },
  { name: "ICICI Bank", category: "bank" },
  { name: "Axis Bank", category: "bank" },
  { name: "Kotak Mahindra Bank", category: "bank" },
  { name: "Bank of Baroda", category: "bank" },
  { name: "Punjab National Bank", category: "bank" },
  { name: "Canara Bank", category: "bank" },
  { name: "Union Bank of India", category: "bank" },
  { name: "IDFC FIRST Bank", category: "bank" },
  { name: "LIC Housing Finance", category: "bank" },
  { name: "Bajaj Finance", category: "bank" },
  { name: "Tata Capital", category: "bank" },
  { name: "HDFC Bank Credit Card", category: "card" },
  { name: "SBI Card", category: "card" },
  { name: "ICICI Bank Credit Card", category: "card" },
  { name: "Axis Bank Credit Card", category: "card" },
  { name: "Kotak Credit Card", category: "card" },
  { name: "American Express", category: "card" },
  { name: "IDFC FIRST Credit Card", category: "card" },

  // Insurance.
  { name: "LIC", category: "life_insurance" },
  { name: "HDFC Life", category: "life_insurance" },
  { name: "ICICI Prudential Life", category: "life_insurance" },
  { name: "SBI Life", category: "life_insurance" },
  { name: "Axis Max Life", category: "life_insurance" },
  { name: "Tata AIA Life", category: "life_insurance" },
  { name: "Star Health", category: "health_insurance" },
  { name: "HDFC ERGO", category: "health_insurance" },
  { name: "Niva Bupa", category: "health_insurance" },
  { name: "Care Health", category: "health_insurance" },
  { name: "ICICI Lombard", category: "health_insurance" },
  { name: "Aditya Birla Health", category: "health_insurance" },
  { name: "ICICI Lombard", category: "vehicle_insurance" },
  { name: "HDFC ERGO", category: "vehicle_insurance" },
  { name: "Bajaj General", category: "vehicle_insurance" },
  { name: "Tata AIG", category: "vehicle_insurance" },
  { name: "Digit Insurance", category: "vehicle_insurance" },
  { name: "New India Assurance", category: "vehicle_insurance" },

  // Property tax: the city corporation.
  { name: "BMC (MCGM)", category: "municipal", states: ["Maharashtra"], cities: ["Mumbai"] },
  { name: "Pune Municipal Corporation", category: "municipal", states: ["Maharashtra"], cities: ["Pune"] },
  { name: "MCD", category: "municipal", states: ["Delhi"] },
  { name: "BBMP", category: "municipal", states: ["Karnataka"], cities: ["Bengaluru"] },
  { name: "GHMC", category: "municipal", states: ["Telangana"], cities: ["Hyderabad"] },
  { name: "Greater Chennai Corporation", category: "municipal", states: ["Tamil Nadu"], cities: ["Chennai"] },
  { name: "Kolkata Municipal Corporation", category: "municipal", states: ["West Bengal"], cities: ["Kolkata"] },
  { name: "Ahmedabad Municipal Corporation", category: "municipal", states: ["Gujarat"], cities: ["Ahmedabad"] },
  { name: "Municipal Corporation Gurugram", category: "municipal", states: ["Haryana"], cities: ["Gurugram"] },
  { name: "Noida Authority", category: "municipal", states: ["Uttar Pradesh"], cities: ["Noida"] },
];

export type HomePlace = { country: string | null; state: string | null; city: string | null };

const normal = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
const holds = (address: string, name: string) => ` ${address} `.includes(` ${normal(name)} `);

/**
 * The state and city an address names, matched by name (rule 9: never a
 * guess). `region` is the household's country (`households.region`).
 */
export function homePlaceFrom(formattedAddress: string | null | undefined, region: string | null | undefined): HomePlace {
  const country = region ? region.toUpperCase() : /\bindia\b/i.test(formattedAddress ?? "") ? "IN" : null;
  if (!formattedAddress || country !== "IN") return { country, state: null, city: null };
  const address = normal(formattedAddress);
  let city: string | null = null;
  let cityState: string | null = null;
  for (const [name, state, aliases] of CITIES) {
    if ([name, ...aliases].some((alias) => holds(address, alias))) {
      city = name;
      cityState = state;
      break;
    }
  }
  const state =
    INDIAN_STATES.find((name) => holds(address, name)) ??
    STATE_ALIASES.find(([alias]) => holds(address, alias))?.[1] ??
    cityState;
  return { country, state, city: city && (!state || state === cityState) ? city : null };
}

/**
 * The payees to offer for a kind of bill, nearest first: those serving the
 * home's city, then its state, then anywhere in India. Payees for another
 * state are left out; outside India (or with no home saved) only the
 * national ones are offered for a utility nobody can place.
 */
export function payeesFor(category: PayeeCategory, home: HomePlace): { near: string[]; others: string[] } {
  if (category === "none") return { near: [], others: [] };
  const inIndia = home.country === null || home.country === "IN";
  if (!inIndia) return { near: [], others: [] };
  const of = PAYEES.filter((payee) => payee.category === category);
  const local = (payee: Payee) => payee.states !== undefined;
  const byCity = home.city ? of.filter((payee) => payee.cities?.includes(home.city!)) : [];
  const byState = home.state ? of.filter((payee) => !byCity.includes(payee) && payee.states?.includes(home.state!) && (!payee.cities || !home.city || payee.cities.includes(home.city))) : [];
  // A state's payees that serve only other cities in it are still offered, after the rest.
  const stateOther = home.state ? of.filter((payee) => !byCity.includes(payee) && !byState.includes(payee) && payee.states?.includes(home.state!)) : [];
  const national = of.filter((payee) => !local(payee));
  const near = unique([...byCity, ...byState].map((payee) => payee.name));
  // With no home to place, a utility's whole list is offered by name, so the household still picks rather than types.
  const others = home.state ? unique([...stateOther, ...national].map((payee) => payee.name)) : unique((national.length > 0 ? national : of).map((payee) => payee.name));
  return { near, others: others.filter((name) => !near.includes(name)) };
}

function unique(names: string[]): string[] {
  return [...new Set(names)];
}
