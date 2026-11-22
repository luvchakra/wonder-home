import type { HomeTalkCase } from "./types";

/**
 * HomeTalk understanding, the owner's review of 20 Nov 2026 ("I have given
 * clear instruction … but it's asking questions which it should not ask").
 * Sentences typed and spoken the way people do; each says what a sensible
 * person expects recorded and whether a question is justified. The golden
 * clock is Wed 23 Sep 2026, 10:00 in Kolkata: "tomorrow" is 2026-09-24.
 * HT-300 onwards.
 */
export const UNDERSTANDING: HomeTalkCase[] = [
  // WhatsApp as a door into HomeTalk (the owner's chat, 2026-11-22: "hello" was answered "I kept that.
  // WonderHome couldn't read anything in it"). Small talk and plain questions are HomeTalk's, by rules, with
  // no model; a forward or a document is still HomeSend's.
  ...(<[string, string, HomeTalkCase["expected"]][]>[
    ["HT-310", "hello", { interpretation: "greet", action: "answer", answer: { includes: ["Send me anything", "coming up"], excludes: ["I kept that", "Failed safely"] } }],
    ["HT-311", "hi", { interpretation: "greet", action: "answer", answer: { excludes: ["I kept that"] } }],
    ["HT-312", "thanks", { interpretation: "greet", action: "answer", answer: { excludes: ["I kept that"] } }],
    ["HT-313", "whats the plan", { interpretation: "ask_status", action: "answer", answer: { includes: ["this week"], excludes: ["I kept that", "I did not follow"] } }],
    ["HT-314", "whats are the upcoming stuff", { interpretation: "ask_status", action: "answer", answer: { includes: ["this week"], excludes: ["I kept that", "I did not follow"] } }],
    ["HT-315", "anything due this week", { interpretation: "ask_status", action: "answer", answer: { excludes: ["I kept that", "I did not follow"] } }],
  ]).map(([id, utterance, expected]): HomeTalkCase => ({
    id, surface: "hometalk", household: "A", category: "cross_domain", actor: "a-kunal", door: { channel: "whatsapp" },
    description: `WhatsApp "${utterance}": HomeTalk answers it, never a HomeSend item.`,
    utterance, expected,
  })),
  {
    id: "HT-316", surface: "hometalk", household: "A", category: "cross_domain", actor: "a-kunal", door: { channel: "whatsapp", forwarded: true },
    description: "A forwarded school notice on WhatsApp is kept in HomeSend, not answered.",
    utterance: "Dear parents, Sports Day is on Saturday at 9am. Please send a water bottle.",
    expected: { interpretation: "homesend" },
  },
  {
    id: "HT-317", surface: "hometalk", household: "A", category: "cross_domain", actor: "a-kunal", door: { channel: "whatsapp", media: true },
    description: "A document sent on WhatsApp with a question as its caption is kept in HomeSend.",
    utterance: "what's this?",
    expected: { interpretation: "homesend" },
  },
  {
    id: "HT-300", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "The owner's sentence, word for word: a doctor's appointment tomorrow at 1pm, recorded in Health with its own reminders, never \"what time?\".",
    utterance: "add a reminder for tomorrow doctor appointment at 1 o'clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed", answer: { excludes: ["What time", "When should"] } },
  },
  {
    id: "HT-301", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal", channel: "voice",
    description: "The same sentence spoken: no punctuation, \"one o clock\".",
    utterance: "add a reminder for tomorrow doctor appointment at one o clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed" },
  },
  {
    id: "HT-302", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "Any reminder with its day and time inside it: set for that day and time, the half of the day chosen and said, no question.",
    utterance: "add a reminder for tomorrow parents meeting at 5",
    expected: { interpretation: "set_reminder", date: "2026-09-24", time: "17:00", action: "executed", answer: { includes: ["parents meeting", "5pm"] } },
  },
  {
    id: "HT-303", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "\"Half past 6\" is a time: the reminder goes off then.",
    utterance: "remind me to call mom tomorrow at half past 6",
    expected: { interpretation: "set_reminder", date: "2026-09-24", time: "18:30", action: "executed" },
  },
  {
    id: "HT-304", surface: "hometalk", household: "A", category: "privacy", actor: "a-kunal",
    description: "Someone else's appointment is never filed as a health record by assumption: it stays a reminder for the speaker.",
    utterance: "add reminder for Asmi's dentist appointment tomorrow at 4",
    expected: { interpretation: "set_reminder", date: "2026-09-24", time: "16:00", action: "executed" },
  },
  {
    id: "HT-305", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "The owner's second try, word for word (dictation: \"Dr apartment\"): the doctor's appointment, tomorrow at 1pm, recorded at once, never a booking held for a yes.",
    utterance: "add a reminder for tomorrow Dr apartment at 1 o'clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed", answer: { excludes: ["Book", "book", "prepared", "waiting for you"] } },
  },
  {
    id: "HT-306", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "\"dr appt\": the same.",
    utterance: "add a reminder for tomorrow dr appt at 1 o'clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed" },
  },
  {
    id: "HT-307", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "\"doc appointment\": the same.",
    utterance: "add a reminder for tomorrow doc appointment at 1 o'clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed" },
  },
  {
    id: "HT-308", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "\"doctor apointment\" (a typo): the same.",
    utterance: "add a reminder for tomorrow doctor apointment at 1 o'clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed" },
  },
  {
    id: "HT-309", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal", channel: "voice",
    description: "Hinglish, spoken: \"reminder kal dr appointment 1 baje\".",
    utterance: "reminder kal dr appointment 1 baje",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed" },
  },
];

/** One sentence of the wide set: what a sensible person expects, and whether a question is justified ("clarify"). */
type Wide = [id: string, utterance: string, expected: HomeTalkCase["expected"], extra?: Partial<HomeTalkCase>];

const R = (date: string, time?: string): HomeTalkCase["expected"] => ({ interpretation: "set_reminder", date, ...(time ? { time } : {}), action: "executed" });
const APPT = (date: string, time: string): HomeTalkCase["expected"] => ({ interpretation: "record_health_appointment", date, time, action: "executed" });
const IS = (interpretation: string, action?: string, date?: string): HomeTalkCase["expected"] => ({ interpretation, ...(action ? { action } : {}), ...(date ? { date } : {}) });

const WIDE: Wide[] = [
  // Reminders, said every way
  ["HU-001", "remind me tomorrow at 7 in the evening to pay the maid", R("2026-09-24", "19:00")],
  ["HU-002", "remind me to take medicine at 9 tonight", R("2026-09-23", "21:00")],
  ["HU-003", "remind me day after tomorrow to renew car insurance", R("2026-09-25", "09:00")],
  ["HU-004", "remind me in 2 hours to check the oven", R("2026-09-23", "12:00")],
  ["HU-005", "remind me at noon tomorrow to call the bank", R("2026-09-24", "12:00")],
  ["HU-006", "remind me friday 6 30 pm to collect the cake", R("2026-09-25", "18:30")],
  ["HU-007", "reminder kal subah 8 baje gas cylinder book karna", R("2026-09-24", "08:00")],
  ["HU-008", "set reminder for 25th to pay school fees", R("2026-09-25")],
  ["HU-009", "remind me on sunday morning to water the plants", R("2026-09-27")],
  ["HU-010", "remind me tmrw 10am call plumber", R("2026-09-24", "10:00")],
  ["HU-011", "pls remind me to buy flowers for mom on saturday", R("2026-09-26")],
  ["HU-012", "remind me tonight to lock the car", R("2026-09-23")],
  ["HU-013", "remind me at quarter to 8 tomorrow to leave for the airport", R("2026-09-24", "07:45")],
  ["HU-014", "remind me tomorrow at five thirty to pick up asmi", R("2026-09-24", "17:30"), { channel: "voice" }],
  ["HU-015", "remind me to call dad at 1", R("2026-09-23", "13:00")],
  // Health appointments
  ["HU-016", "dentist appointment on friday at 4 pm", APPT("2026-09-25", "16:00")],
  ["HU-017", "I have an eye checkup tomorrow at 11", APPT("2026-09-24", "11:00")],
  ["HU-018", "doctor appointment kal 1 baje", APPT("2026-09-24", "13:00")],
  ["HU-019", "my physio is at 5 tomorrow", APPT("2026-09-24", "17:00")],
  ["HU-020", "add a reminder for my dentist appointment day after tomorrow at half past 10", APPT("2026-09-25", "10:30")],
  // Calendar
  ["HU-021", "Plan dinner with the Sharmas on Saturday at 8", IS("plan_event", "executed", "2026-09-26")],
  ["HU-022", "family movie night sunday evening", IS("plan_event", "executed", "2026-09-27")],
  ["HU-023", "Asmi's dance recital is on 2 Oct at 6 pm", IS("file_with_homesend", "executed")],
  ["HU-024", "Manan has a football match this saturday at 9 am", IS("file_with_homesend", "executed")],
  ["HU-025", "keep saturday evening free for family time", IS("plan_event", "executed", "2026-09-26")],
  ["HU-026", "We're going to Lonavala this weekend", IS("plan_event", "executed", "2026-09-26")],
  ["HU-027", "Riya's birthday party on Saturday at 4", IS("file_with_homesend", "executed")],
  // To Buy
  ["HU-028", "add 2 litres milk and a dozen eggs", IS("add_to_list", "executed")],
  ["HU-029", "half kg tomatoes", IS("add_to_list", "executed")],
  ["HU-030", "need 2 packets of bread", IS("add_to_list", "executed")],
  ["HU-031", "milk khatam ho gaya", IS("add_to_list")],
  ["HU-032", "we're out of atta", IS("add_to_list")],
  ["HU-033", "add onions potatoes and coriander to the list", IS("add_to_list")],
  ["HU-034", "put 1 kg sugar on the shopping list", IS("add_to_list", "executed")],
  ["HU-035", "remove bananas from the list", IS("remove_from_list")],
  ["HU-036", "bought 2 kg potatoes and 1 litre milk", IS("mark_bought")],
  ["HU-037", "we have 10 eggs", IS("set_stock")],
  ["HU-038", "used 2 eggs", IS("use_stock")],
  ["HU-039", "add 500g paneer", IS("add_to_list", "executed")],
  ["HU-040", "get 3 bottles of coke for the party", IS("add_to_list", "executed")],
  ["HU-041", "ek packet maggi add karo", IS("add_to_list", "executed")],
  // Meals
  ["HU-042", "plan rajma chawal for lunch tomorrow", IS("plan_meal", "executed", "2026-09-24")],
  ["HU-043", "dinner tonight is pasta", IS("plan_meal", "executed", "2026-09-23")],
  ["HU-044", "make poha for breakfast on sunday", IS("plan_meal", "executed", "2026-09-27")],
  ["HU-045", "what's for dinner today", IS("ask_status", "answer")],
  ["HU-046", "plan dal makhani for dinner day after tomorrow", IS("plan_meal", "executed", "2026-09-25")],
  // Bills: recorded, never paid
  ["HU-047", "add the water bill, ₹1,200, due on the 10th every month", IS("add_bill", "executed")],
  ["HU-048", "track the gym membership 1500 every month on the 5th", IS("add_bill", "executed")],
  ["HU-049", "I paid the electricity bill 2840 today", IS("record_bill_payment", "executed")],
  ["HU-050", "electricity bill is twelve hundred this month", IS("set_bill_amount")],
  ["HU-051", "paid internet 999 yesterday", IS("record_bill_payment", "executed", "2026-09-22")],
  ["HU-052", "pay the electricity bill", { interpretation: "make_payment", safety: { consequential: true, executed: false } }],
  ["HU-053", "mark rent paid", IS("record_bill_payment", "clarify")],
  // Away
  ["HU-054", "Sunita won't come tomorrow", IS("record_absence", "executed", "2026-09-24")],
  ["HU-055", "maid is on leave till monday", IS("record_absence", "executed")],
  ["HU-056", "I'm travelling to Delhi from friday to sunday", IS("record_absence", "executed", "2026-09-25")],
  // School
  ["HU-057", "Asmi has a maths test on friday", IS("file_with_homesend", "executed")],
  ["HU-058", "mark Asmi's maths worksheet done", IS("complete_school_item")],
  ["HU-059", "Manan's science project is due next monday", IS("file_with_homesend", "executed")],
  ["HU-060", "move Manan's science project to Friday", IS("adjust_schedule")],
  // Health
  ["HU-061", "I've had a headache since yesterday", IS("log_health_issue", "executed")],
  ["HU-062", "my bp is 130/85", IS("log_vital", "executed")],
  ["HU-063", "my headache is gone", IS("resolve_health_issue")],
  ["HU-064", "I want to walk 3 times a week", IS("set_fitness_goal", "executed")],
  // Home
  ["HU-065", "the washing machine is making noise again", IS("raise_service_request")],
  ["HU-066", "AC not cooling in the bedroom", IS("raise_service_request")],
  ["HU-067", "geyser kharab hai", IS("raise_service_request")],
  // Places
  ["HU-068", "suggest places for dinner tonight", IS("find_places")],
  ["HU-069", "where can we take the kids this weekend", IS("find_places")],
  // Questions about the household's own records
  ["HU-070", "what's on tomorrow", IS("ask_status", "answer")],
  ["HU-071", "any bills due this week", IS("ask_status", "answer")],
  ["HU-072", "what's on the grocery list", IS("ask_status", "answer")],
  ["HU-073", "when is Asmi's next test", IS("ask_status", "answer")],
  ["HU-074", "what do I need to do today", IS("ask_status", "answer")],
  ["HU-075", "how much is the electricity bill", IS("ask_status", "answer")],
  ["HU-076", "whats pending this week", IS("ask_status", "answer")],
  // Preferences and notes
  ["HU-077", "we prefer dinner at 8", IS("set_preference", "executed")],
  ["HU-078", "Asmi doesn't eat mushrooms", IS("set_preference", "executed")],
  ["HU-079", "note that the plumber comes on monday", IS("file_with_homesend", "executed")],
  ["HU-080", "the wifi password is on the fridge", IS("set_preference", "executed")],
  // Screens and small talk
  ["HU-081", "open the calendar", IS("open_screen")],
  ["HU-082", "take me to groceries", IS("open_screen")],
  ["HU-083", "hi", IS("greet")],
  ["HU-084", "thank you", IS("greet")],
  // Several things at once
  ["HU-085", "add 2 litres milk and remind me to call mom at 6", IS("add_to_list", "executed")],
  ["HU-086", "Sunita is off tomorrow and plan maggi for dinner", IS("record_absence", "executed", "2026-09-24")],
  // Hinglish and Indian English
  ["HU-087", "kal Manan ki school mein PTM hai 11 baje", IS("file_with_homesend", "executed")],
  ["HU-088", "pls add curd 1 packet", IS("add_to_list", "executed")],
  ["HU-089", "do the needful and add 1 bottle dettol", IS("add_to_list", "executed")],
  ["HU-090", "tomorrow 5pm cricket coaching for Manan", IS("file_with_homesend", "executed")],
  ["HU-091", "remind me day after tmrw abt the car service", R("2026-09-25")],
  ["HU-092", "electricity bill paid 2840", IS("record_bill_payment", "executed")],
  // Spoken: no punctuation, numbers as words
  ["HU-093", "set a reminder for tomorrow at seven in the morning to go for a walk", R("2026-09-24", "07:00"), { channel: "voice" }],
  ["HU-094", "remind me at half past six this evening to call grandma", R("2026-09-23", "18:30"), { channel: "voice" }],
  ["HU-095", "add two litres of milk", IS("add_to_list", "executed"), { channel: "voice" }],
  ["HU-096", "dentist appointment friday at four pm", APPT("2026-09-25", "16:00"), { channel: "voice" }],
  // Corrections and follow-ups
  ["HU-097", "Plan movie night Saturday evening", IS("plan_event", "executed", "2026-09-26"), { followUps: [{ utterance: "no make it sunday", expected: IS("plan_event", "executed", "2026-09-27") }] }],
  ["HU-098", "remind me tomorrow at 1 to call the bank", R("2026-09-24", "13:00"), { followUps: [{ utterance: "no, 1 am", expected: R("2026-09-24", "01:00") }] }],
  ["HU-099", "dentist appointment on friday at 4 pm", APPT("2026-09-25", "16:00"), { followUps: [{ utterance: "no, it's on the 2nd", expected: { interpretation: "record_health_appointment", date: "2026-10-02" } }] }],
  ["HU-100", "add a reminder for tomorrow doctor appointment", IS("set_reminder"), { followUps: [{ utterance: "at 1 o'clock", expected: APPT("2026-09-24", "13:00") }] }],
];

/**
 * The wide set (`npm run eval -- --set understanding`): measured, not a release
 * gate, because much of it is the model's work and a deterministic run reads
 * only the rules. A sentence the rules read too joins the golden set through
 * `GATED_WIDE`.
 */
export const UNDERSTANDING_SET: HomeTalkCase[] = WIDE.map(([id, utterance, expected, extra]) => ({
  id, surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
  description: `Understanding (2026-11-20): "${utterance}"`,
  utterance, expected, ...extra,
}));

/**
 * Sentences the rules alone do not yet read as a person would, with why. They
 * stay in the measured set (a provider run scores the model on them) and out of
 * the release gate until fixed; fixing one means removing it from here.
 */
export const STILL_WEAK: Readonly<Record<string, string>> = {
  "HU-026": "a whole-weekend plan can't go on the calendar as read, so it asks for the day (never \"prepared\" any more)",
  "HU-050": "an amount in words (\"twelve hundred\") is not read by the bill rules",
  "HU-055": "absences are one day at a time; \"till monday\" goes to HomeSend to be read",
  "HU-066": "\"AC not cooling in the bedroom\" is not read by the repair rules",
  "HU-069": "\"where can we take the kids\" is read as a calendar question, not a place search",
  "HU-075": "answered from the bills, but scored as a question",
  "HU-080": "a household fact with no person or meal is not read as a preference",
  "HU-085": "several things in one sentence: the conversation route splits it, the evaluation runner does not",
  "HU-086": "several things in one sentence: the conversation route splits it, the evaluation runner does not",
};

/** The wide set's sentences the rules read correctly: a release gate from now on. */
export const UNDERSTANDING_GATED: HomeTalkCase[] = UNDERSTANDING_SET.filter((c) => !(c.id in STILL_WEAK));
