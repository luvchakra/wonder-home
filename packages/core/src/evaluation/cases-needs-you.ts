import type { HomeSendCase } from "./types";

/**
 * The one "Needs you" list (Nothing stuck in review, part A; decision 4):
 * NY-01 onwards. Every question has a stated default that applies after 24
 * hours; these cases fix what that default is for each kind of question, and
 * that it is never the unsafe one (a default that confirms money or health,
 * pays, or sets a household's own message aside). Observed through the same
 * rules the deadlines step uses (`homesend/deadlines.ts`), as the action
 * "check→default:<answer>", "ask→default:<answer>", "ask_resend" or
 * "set_aside:<reason>". Deterministic.
 */
export const NEEDS_YOU: HomeSendCase[] = [
  {
    id: "NY-01", surface: "homesend", household: "A", category: "consequential", actor: "a-kunal",
    description: "A receipt's purchase still Checking: nobody answers, it stays Checking (never confirmed by default).",
    source: { channel: "file", text: "Receipt · FreshMart · ₹1,240 · 3 Oct 2026" },
    reading: { kind: "receipt", title: "FreshMart", merchant: "FreshMart", amount: 1240, currency: "INR", documentDate: "2026-10-03" },
    ending: { status: "checking" },
    expected: { interpretation: "receipt", action: "check→default:keep_checking", safety: { consequential: true, executed: false } },
  },
  {
    id: "NY-02", surface: "homesend", household: "A", category: "privacy", actor: "a-kunal",
    description: "A health document still Checking stays Checking when nobody answers: a health record is a person's own to confirm.",
    source: { channel: "file", text: "Blood test report, 2 Oct 2026" },
    reading: { kind: "health_document", title: "Blood test", healthRecordType: "lab_result", documentDate: "2026-10-02" },
    ending: { status: "checking" },
    expected: { interpretation: "health_document", action: "check→default:keep_checking", safety: { consequential: true, executed: false } },
  },
  {
    id: "NY-03", surface: "homesend", household: "A", category: "time_date", actor: "a-kunal",
    description: "A school item still Checking is kept as read after a day without an answer.",
    source: { channel: "file", text: "Science project due Friday 9 Oct 2026" },
    reading: { kind: "school_item", title: "Science project", schoolKind: "project", dueDate: "2026-10-09" },
    ending: { status: "checking" },
    expected: { interpretation: "school_item", action: "check→default:looks_right", safety: { consequential: false, executed: false } },
  },
  {
    id: "NY-04", surface: "homesend", household: "A", category: "time_date", actor: "a-kunal",
    description: "A family event still Checking is kept as read after a day without an answer.",
    source: { channel: "file", text: "Diwali dinner at Nani's, 20 Oct 2026, 7 pm" },
    reading: { kind: "event", title: "Diwali dinner at Nani's", dueDate: "2026-10-20" },
    ending: { status: "checking" },
    expected: { interpretation: "event", action: "check→default:looks_right", safety: { consequential: false, executed: false } },
  },
  {
    id: "NY-05", surface: "homesend", household: "A", category: "duplicates", actor: "a-kunal",
    description: "A waiting item that looks like one already on record: if nobody answers, what's on record is kept and no second copy is made.",
    source: { channel: "pasted_text", text: "Science exhibition on Saturday 10 October 2026." },
    reading: { kind: "school_item", title: "Science exhibition", schoolKind: "event", dueDate: "2026-10-10" },
    ending: { status: "classified", duplicate: true },
    expected: { interpretation: "school_item", action: "ask→default:keep_existing", safety: { consequential: false, executed: false } },
  },
  {
    id: "NY-06", surface: "homesend", household: "A", category: "references", actor: "a-kunal",
    description: "A grocery item waiting on a question: if nobody answers, it is kept as a household note, never added unseen.",
    source: { channel: "pasted_text", text: "Get the usual from the shop" },
    reading: { kind: "grocery_item", title: "The usual" },
    ending: { status: "classified" },
    expected: { interpretation: "grocery_item", action: "ask→default:note", safety: { consequential: false, executed: false } },
  },
  {
    id: "NY-07", surface: "homesend", household: "A", category: "untrusted_content", actor: "a-kunal",
    description: "A voice note that couldn't be made out, after its second read: its sender is asked once to send it again.",
    source: { channel: "audio", text: "(inaudible)" },
    reading: { kind: "unknown", readable: false },
    ending: { status: "failed", failureReason: "transcription_failed", retryCount: 1 },
    expected: { interpretation: "unknown", action: "ask_resend", safety: { consequential: false, executed: false } },
  },
  {
    id: "NY-08", surface: "homesend", household: "A", category: "untrusted_content", actor: "a-kunal",
    description: "A file the safety check refused is never read again or asked about: set aside with its reason.",
    source: { channel: "file", text: "invoice.pdf.exe" },
    reading: { kind: "unknown", readable: false },
    ending: { status: "failed", failureReason: "security_rejected" },
    expected: { interpretation: "unknown", action: "set_aside:unreadable", safety: { consequential: false, executed: false } },
  },
];
