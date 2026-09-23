import { describe, expect, it } from "vitest";

import type { IntakeExtraction } from "../ai/classify-intake";
import { buildContextItems, type ContextRecords } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { findPotentialMatches, needsReconciliation } from "../context/matching";
import type { HouseholdContextItem, IncomingFact } from "../context/types";
import type { Obligation } from "../finance/payments";
import type { HouseholdMember } from "../identity/households";
import type { SchoolItem } from "../school/items";
import { resolveRecipientHouseholds } from "./addresses";
import { decideConfirmation } from "./confirmation";
import { toEmailSource } from "./email-gateway";
import { confirmTranscript, ingestEmailAttachment, ingestFile, ingestLink, ingestText, understand, type IngestDeps } from "./ingest";
import { fetchLinkSafely, type Resolver, type Transport, type TransportResponse } from "./link-fetch";
import { proposalFor, type HomeSendCandidate } from "./reconcile";
import { createEmailHomeSendItem } from "./repository";
import { resolveIntakePeople } from "./resolve";
import { fakeSupabase } from "./testing";

/**
 * The Wave 3 §20 acceptance test matrix — one test per row, each driving
 * the real pipeline (`ingest.ts`, `link-fetch.ts`, `resolve.ts`,
 * `reconcile.ts`, `confirmation.ts`, the email helpers) with stand-ins only
 * for what is outside this repository: the model, the speech service, the
 * web and the database. The row names are the spec's own, so this file is
 * the checklist.
 */

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OTHER_HOUSEHOLD = "99999999-9999-4999-8999-999999999999";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const actor = { householdId: HOUSEHOLD, memberId: MEMBER };
const scan: IngestDeps["scan"] = async () => ({ scanned: false });

function reading(over: Partial<IntakeExtraction>): IntakeExtraction {
  return {
    readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
    schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null,
    subjectMemberName: null, summary: null, people: [], facts: [], needs: [], change: "new", confidence: "high", secondary: null,
    ...over,
  };
}

function model(result: IntakeExtraction | null | "no_provider") {
  const seen: Parameters<NonNullable<IngestDeps["classify"]>>[] = [];
  const classify: NonNullable<IngestDeps["classify"]> = async (...args) => {
    seen.push(args);
    return result;
  };
  return { classify, seen };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n% school circular\n");
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 2]);

// --- the household every row runs against ----------------------------------

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-23T06:00:00Z");

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"]): HouseholdMember {
  return {
    id, displayName, memberType, status: "active", roles: [], isOwner: false, dateOfBirth: null, nickname: null, relationship: null,
    occupation: null, schoolOrWorkLocation: null, specialOccasionLabel: null, specialOccasionDate: null, avatarUrl: null,
  };
}
const MEMBERS = [member("kunal", "Kunal Mehta", "adult"), member("asmi", "Asmi", "child"), member("manan", "Manan", "child")];
const NAMES = new Map(MEMBERS.map((m) => [m.id, m.displayName]));

function schoolItem(id: string, childMemberId: string, title: string, dueAt: string, extra: Partial<SchoolItem> = {}): SchoolItem {
  return { id, childMemberId, kind: "event", title, subject: null, detail: null, dueAt: new Date(dueAt), estimatedMinutes: null, estimateSource: null, status: "pending", completedAt: null, provider: null, externalId: null, ...extra };
}
function bill(id: string, name: string, extra: Partial<Obligation> = {}): Obligation {
  return { id, name, kind: "utility", payee: "City Power", amountMinor: 124050, currency: "INR", dueOn: "2026-10-05", responsibleMemberId: "kunal", status: "received", requiresReview: false, ...extra };
}
function contextItems(records: ContextRecords): HouseholdContextItem[] {
  return applyFreshness(buildContextItems({ members: MEMBERS, ...records }, { householdId: HOUSEHOLD, householdName: "Mehta Home", timezone: TZ, now: NOW, viewerMemberId: "kunal" }), NOW);
}
function reconcile(items: HouseholdContextItem[], candidate: HomeSendCandidate) {
  const incoming: IncomingFact = {
    domain: candidate.kind === "bill" ? "bills" : "school",
    title: candidate.title,
    subjectMemberId: candidate.subjectMemberId ?? null,
    date: candidate.date ?? null,
    amountMinor: candidate.amount != null ? Math.round(candidate.amount * 100) : null,
    attributes: { payee: candidate.payee ?? undefined },
    capturedAt: candidate.capturedAt ?? null,
  };
  const matches = findPotentialMatches(incoming, items, { timezone: TZ });
  const best = matches.find(needsReconciliation) ?? (candidate.change === "cancellation" ? matches[0] : undefined);
  return best ? proposalFor(best, candidate, NAMES) : null;
}
function subjectFor(kind: "school_item" | "bill" | "health_document", names: string[]) {
  return resolveIntakePeople({ kind, entities: [], references: names.map((text) => ({ text, candidates: [], confidence: 0 })) }, contextItems({}), { viewerMemberId: "kunal" }).subject;
}

// --- a stand-in web, reached only through the real SSRF-safe fetcher --------

const encoder = new TextEncoder();
function page(status: number, headers: Record<string, string>, body = ""): TransportResponse {
  return {
    status,
    headers,
    body: (async function* () {
      if (body) yield encoder.encode(body);
    })(),
    abort: () => {},
  };
}
const DNS: Record<string, string> = { "school.example.org": "93.184.216.34", "shop.example.com": "93.184.216.35", "events.example.net": "93.184.216.36", "intranet.example.org": "10.0.0.7" };
const resolve: Resolver = async (host) => (DNS[host] ? [{ address: DNS[host]!, family: 4 }] : []);
const WEB: Record<string, () => TransportResponse> = {
  "https://school.example.org/notices/sports-day": () => page(200, { "content-type": "text/html" }, "<title>Sports Day</title><p>Sports Day is on 26 September. Bring a white T-shirt.</p>"),
  "https://shop.example.com/rice-5kg": () => page(200, { "content-type": "text/html" }, "<title>Basmati rice 5kg</title><p>In stock.</p>"),
  "https://events.example.net/annual-day": () => page(200, { "content-type": "text/html" }, "<title>Annual Day</title><p>Annual Day on 2 October at 10am.</p>"),
  "https://school.example.org/old-notice": () => page(301, { location: "https://school.example.org/notices/sports-day" }),
  "https://school.example.org/leak": () => page(302, { location: "http://169.254.169.254/latest/meta-data/" }),
  "https://school.example.org/huge": () => page(200, { "content-type": "text/html", "content-length": String(50 * 1024 * 1024) }),
};
const transport: Transport = async (url) => {
  const route = WEB[url.toString()];
  if (!route) throw new Error("no route");
  return route();
};
const fetchLink: IngestDeps["fetchLink"] = (url) => fetchLinkSafely(url, { resolve, transport });

// ============================================================================

describe("§20 acceptance matrix — Text", () => {
  it("school message", async () => {
    const db = fakeSupabase();
    const { classify } = model(reading({ kind: "school_item", title: "Sports Day", schoolKind: "event", dueDate: "2026-09-26", people: ["Asmi"] }));
    const outcome = await ingestText(db.client, actor, { text: "Asmi's Sports Day is on Saturday 26 September." }, { classify });
    expect(outcome.state).toBe("needs_review");
    expect(outcome.item.classifiedKind).toBe("school_item");
    expect(subjectFor("school_item", ["Asmi"]).selected?.displayName).toBe("Asmi");
  });

  it("grocery request", async () => {
    const db = fakeSupabase();
    const { classify } = model(reading({ kind: "grocery_item", title: "Milk", quantity: 2, unit: "litre" }));
    const outcome = await ingestText(db.client, actor, { text: "We're out of milk — get 2 litres" }, { classify });
    expect(outcome.item.extracted).toMatchObject({ title: "Milk", quantity: 2 });
    expect(outcome.item.understanding?.candidateActions[0]?.type).toBe("add_grocery_item");
  });

  it("bill reminder", async () => {
    const db = fakeSupabase();
    const { classify } = model(reading({ kind: "bill", title: "Electricity bill", payee: "City Power", amount: 1240.5, currency: "INR", dueDate: "2026-10-05" }));
    const outcome = await ingestText(db.client, actor, { text: "City Power: your bill of Rs 1240.50 is due on 5 Oct." }, { classify });
    expect(outcome.item.extracted).toMatchObject({ amount: 1240.5, dueDate: "2026-10-05" });
    // A bill is money: it always waits for a person (§12).
    expect(decideConfirmation({ kind: "bill", extracted: outcome.item.extracted, understanding: outcome.item.understanding ?? null, reconciliation: null, subject: null, memberInitiated: true, autonomy: "execute" }).mode).toBe("govern");
  });

  it("appointment message", async () => {
    const db = fakeSupabase();
    const { classify } = model(reading({ kind: "health_document", title: "Dentist appointment", healthRecordType: "visit_summary", documentDate: "2026-09-30", people: ["Manan"] }));
    const outcome = await ingestText(db.client, actor, { text: "Reminder: Manan's dentist appointment is Wednesday 30 Sep at 4pm." }, { classify });
    expect(outcome.item.classifiedKind).toBe("health_document");
    expect(decideConfirmation({ kind: "health_document", extracted: outcome.item.extracted, understanding: outcome.item.understanding ?? null, reconciliation: null, subject: null, memberInitiated: true, autonomy: "execute" }).mode).toBe("govern");
  });

  it("ambiguous person", () => {
    const subject = subjectFor("school_item", []);
    expect(subject).toMatchObject({ selected: null, question: "Who is this for — Asmi or Manan?" });
    expect(decideConfirmation({ kind: "school_item", extracted: { title: "Book fair", needs: [], confidence: "high" }, understanding: null, reconciliation: null, subject, memberInitiated: true, autonomy: "execute" }).mode).toBe("ask");
  });

  it("correction", () => {
    const found = reconcile(contextItems({ obligations: [bill("b-fee", "Term fee", { kind: "school_fee", payee: "Green Valley School", amountMinor: 120000, dueOn: "2026-10-10" })] }), {
      kind: "bill", title: "Term fee", payee: "Green Valley School", amount: 1500, date: "2026-10-10", change: "update",
    });
    expect(found?.proposal).toEqual({ type: "update", changes: [{ field: "amount", from: 120000, to: 150000 }] });
  });
});

describe("§20 acceptance matrix — Files", () => {
  const circular = reading({ kind: "school_item", title: "Annual Day circular", schoolKind: "notice" });

  it("image", async () => {
    const db = fakeSupabase();
    const { classify, seen } = model(circular);
    const outcome = await ingestFile(db.client, actor, { bytes: PNG, claimedType: "image/png", filename: "notice.png" }, { classify, scan });
    expect(outcome.state).toBe("needs_review");
    expect(Object.keys(seen[0]![1])).toEqual(["image"]);
  });

  it("PDF", async () => {
    const db = fakeSupabase();
    const { classify, seen } = model(circular);
    const outcome = await ingestFile(db.client, actor, { bytes: PDF, claimedType: "application/pdf", filename: "circular.pdf" }, { classify, scan });
    expect(outcome.state).toBe("needs_review");
    expect(Object.keys(seen[0]![1])).toEqual(["document"]);
  });

  it("scanned PDF", async () => {
    // No text layer: the PDF itself goes to the model as a document, never
    // pre-extracted text, so a scan is read the same way a typed one is.
    const db = fakeSupabase();
    const scanned = new Uint8Array([...encoder.encode("%PDF-1.4\n"), 0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(64)]);
    const { classify, seen } = model(circular);
    const outcome = await ingestFile(db.client, actor, { bytes: scanned, claimedType: "application/pdf", filename: "scan.pdf" }, { classify, scan });
    expect(outcome.state).toBe("needs_review");
    expect(seen[0]![1]).toEqual({ document: { mediaType: "application/pdf", base64: Buffer.from(scanned).toString("base64") } });
  });

  it("malformed file", async () => {
    const db = fakeSupabase();
    const { classify, seen } = model(circular);
    const outcome = await ingestFile(db.client, actor, { bytes: encoder.encode("not really a pdf"), claimedType: "application/pdf", filename: "broken.pdf" }, { classify, scan });
    expect(outcome.state).toBe("failed");
    expect(seen).toHaveLength(0);
  });

  it("unreadable file", async () => {
    const db = fakeSupabase();
    const { classify } = model(reading({ readable: false }));
    const outcome = await ingestFile(db.client, actor, { bytes: PNG, claimedType: "image/png", filename: "blur.png" }, { classify, scan });
    expect(outcome).toMatchObject({ state: "failed", failureReason: "unreadable" });
    expect(db.tables.home_send_items?.[0]).toMatchObject({ status: "failed" });
  });

  it("malicious file", async () => {
    const db = fakeSupabase();
    const { classify, seen } = model(circular);
    const outcome = await ingestFile(db.client, actor, { bytes: PDF, claimedType: "image/jpeg", filename: "photo.jpg" }, { classify, scan });
    expect(outcome).toMatchObject({ state: "failed", failureReason: "security_rejected" });
    const flagged = await ingestFile(fakeSupabase().client, actor, { bytes: PDF, claimedType: "application/pdf" }, { classify, scan: async () => ({ scanned: true, clean: false }) });
    expect(flagged).toMatchObject({ state: "failed", failureReason: "security_rejected" });
    expect(seen).toHaveLength(0);
  });

  it("multi-page document", async () => {
    const db = fakeSupabase();
    const pages = Array.from({ length: 12 }, (_, index) => `%page ${index + 1}\n${"x".repeat(2000)}\n`).join("");
    const long = encoder.encode(`%PDF-1.7\n${pages}%%EOF\n`);
    const { classify, seen } = model(circular);
    const outcome = await ingestFile(db.client, actor, { bytes: long, claimedType: "application/pdf", filename: "handbook.pdf" }, { classify, scan });
    expect(outcome.state).toBe("needs_review");
    // One document, read whole — not one item per page.
    expect(seen).toHaveLength(1);
    expect(db.tables.home_send_items).toHaveLength(1);
  });
});

describe("§20 acceptance matrix — Audio", () => {
  const voice = (text: string, confidence: number, result: IntakeExtraction = reading({ kind: "grocery_item", title: "Rice" })) => {
    const db = fakeSupabase();
    const { classify, seen } = model(result);
    return {
      db,
      seen,
      classify,
      run: () => ingestFile(db.client, actor, { bytes: WEBM, claimedType: "audio/webm", filename: "note.webm" }, { classify, scan, transcribe: async () => ({ status: "transcribed", text, confidence }) }),
    };
  };

  it("clean note", async () => {
    const { run, seen } = voice("Add five kilos of rice to the list", 0.95);
    expect((await run()).state).toBe("needs_review");
    expect(seen).toHaveLength(1);
  });

  it("noise/accent", async () => {
    const { run, seen } = voice("ad fie kilo rise", 0.62);
    const outcome = await run();
    expect(outcome.state).toBe("check_transcript");
    expect(outcome.heard?.text).toBe("ad fie kilo rise");
    expect(seen).toHaveLength(0);
  });

  it("ambiguous name", async () => {
    const { run } = voice("Book fair on Friday for my kid", 0.93, reading({ kind: "school_item", title: "Book fair", people: [] }));
    const outcome = await run();
    expect(outcome.state).toBe("needs_review");
    expect(subjectFor("school_item", []).question).toBe("Who is this for — Asmi or Manan?");
  });

  it("low transcript confidence", async () => {
    const { run, seen, db, classify } = voice("something about the school", 0.3);
    const outcome = await run();
    expect(outcome.state).toBe("check_transcript");
    expect(seen).toHaveLength(0);
    // Only what the person confirms or types is read on.
    const confirmed = await confirmTranscript(db.client, actor, { itemId: outcome.itemId, text: "Science worksheet due Monday" }, { classify });
    expect(confirmed.state).toBe("needs_review");
  });

  it("payment/order instruction", async () => {
    // Confident enough for an ordinary note, not for paying or ordering (§17).
    const { run, seen } = voice("Pay the electricity bill of 1240 rupees", 0.85);
    const outcome = await run();
    expect(outcome.state).toBe("check_transcript");
    expect(outcome.heard?.prompt).toMatch(/pay for or order/);
    expect(seen).toHaveLength(0);
  });
});

describe("§20 acceptance matrix — Links", () => {
  const link = async (url: string, result: IntakeExtraction = reading({ kind: "school_item", title: "Sports Day" })) => {
    const db = fakeSupabase();
    const { classify, seen } = model(result);
    const outcome = await ingestLink(db.client, actor, { url }, { classify, fetchLink });
    return { outcome, seen, row: db.tables.home_send_items?.[0] };
  };

  it("school page", async () => {
    const { outcome, seen } = await link("https://school.example.org/notices/sports-day");
    expect(outcome.state).toBe("needs_review");
    expect(seen[0]?.[1]).toMatchObject({ text: expect.stringContaining("Sports Day is on 26 September") });
  });

  it("product page", async () => {
    const { outcome } = await link("https://shop.example.com/rice-5kg", reading({ kind: "grocery_item", title: "Basmati rice", quantity: 5, unit: "kg" }));
    expect(outcome.item.classifiedKind).toBe("grocery_item");
  });

  it("event page", async () => {
    const { outcome, seen } = await link("https://events.example.net/annual-day", reading({ kind: "school_item", title: "Annual Day", schoolKind: "event", dueDate: "2026-10-02" }));
    expect(outcome.state).toBe("needs_review");
    expect(seen[0]?.[2]).toMatchObject({ url: "https://events.example.net/annual-day" });
  });

  it("invalid URL", async () => {
    const { outcome, seen } = await link("htp:/not a link");
    expect(outcome).toMatchObject({ state: "failed", failureReason: "link_blocked" });
    expect(seen).toHaveLength(0);
  });

  it("redirect", async () => {
    // A safe redirect is followed (each hop re-checked) and the page it lands
    // on is read; the item keeps the address the person actually sent.
    const safe = await link("https://school.example.org/old-notice");
    expect(safe.outcome.state).toBe("needs_review");
    expect(safe.seen[0]?.[1]).toMatchObject({ text: expect.stringContaining("Sports Day is on 26 September") });
    expect(safe.row).toMatchObject({ source_url: "https://school.example.org/old-notice" });
    const toMetadata = await link("https://school.example.org/leak");
    expect(toMetadata.outcome).toMatchObject({ state: "failed", failureReason: "link_blocked" });
    expect(toMetadata.seen).toHaveLength(0);
  });

  it("private-network URL", async () => {
    for (const url of ["http://10.0.0.7/admin", "https://intranet.example.org/"]) {
      const { outcome, seen } = await link(url);
      expect(outcome).toMatchObject({ state: "failed", failureReason: "link_blocked" });
      expect(seen).toHaveLength(0);
    }
  });

  it("oversized response", async () => {
    const { outcome, seen } = await link("https://school.example.org/huge");
    expect(outcome).toMatchObject({ state: "failed", failureReason: "too_large" });
    expect(seen).toHaveLength(0);
  });
});

describe("§20 acceptance matrix — Email", () => {
  const ADDRESS = "hs-mehta@inbox.wonderhome.test";
  function withAddresses(extra: Record<string, unknown>[] = []) {
    return fakeSupabase({
      homesend_addresses: [{ household_id: HOUSEHOLD, address: ADDRESS, status: "active" }, ...extra],
    });
  }
  const received = (over: Record<string, unknown> = {}) =>
    toEmailSource({
      id: "email-1",
      from: "Green Valley School <office@greenvalley.example.org>",
      to: [ADDRESS],
      cc: [],
      subject: "Sports Day",
      created_at: "2026-09-23T05:00:00Z",
      text: "Sports Day is Saturday 26 September.",
      html: null,
      attachments: [],
      ...over,
    } as Parameters<typeof toEmailSource>[0]);

  async function receive(db: ReturnType<typeof fakeSupabase>, email = received()) {
    const [householdId] = await resolveRecipientHouseholds(db.client, email.to);
    const created = await createEmailHomeSendItem(db.client, { householdId: householdId!, externalId: email.externalId, senderAddress: email.from, rawText: email.text ?? "", subject: email.subject });
    return created;
  }

  it("plain email", async () => {
    const db = withAddresses();
    const { classify, seen } = model(reading({ kind: "school_item", title: "Sports Day" }));
    const { item } = await receive(db);
    const outcome = await understand(db.client, HOUSEHOLD, item.id, { source: { text: "Sports Day is Saturday 26 September." }, channel: "email", context: { channel: "a forwarded email", subject: "Sports Day", from: item.senderAddress }, text: "Sports Day is Saturday 26 September." }, { classify });
    expect(outcome.state).toBe("needs_review");
    expect(seen[0]?.[2]).toMatchObject({ channel: "a forwarded email", subject: "Sports Day" });
  });

  it("email + PDF", async () => {
    const db = withAddresses();
    const { item } = await receive(db);
    const { classify } = model(reading({ kind: "school_item", title: "Circular" }));
    const outcome = await ingestEmailAttachment(db.client, { householdId: HOUSEHOLD, parentItemId: item.id, externalId: "email-1:att-pdf", bytes: PDF, claimedType: "application/pdf", filename: "circular.pdf" }, { classify, scan });
    expect(outcome.state).toBe("needs_review");
    expect(db.tables.home_send_items?.find((row) => row.id === outcome.itemId)).toMatchObject({ source: "email_attachment", parent_item_id: item.id, content_type: "application/pdf" });
  });

  it("email + image", async () => {
    const db = withAddresses();
    const { item } = await receive(db);
    const { classify, seen } = model(reading({ kind: "bill", title: "Water bill" }));
    const outcome = await ingestEmailAttachment(db.client, { householdId: HOUSEHOLD, parentItemId: item.id, externalId: "email-1:att-png", bytes: PNG, claimedType: "image/png", filename: "bill.png" }, { classify, scan });
    expect(outcome.state).toBe("needs_review");
    expect(Object.keys(seen[0]![1])).toEqual(["image"]);
  });

  it("duplicate webhook", async () => {
    const db = withAddresses();
    const first = await receive(db);
    const second = await receive(db);
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true, item: { id: first.item.id } });
    expect(db.tables.home_send_items?.filter((row) => row.external_id === "email-1")).toHaveLength(1);
  });

  it("revoked HomeSend address", async () => {
    const db = fakeSupabase({ homesend_addresses: [{ household_id: HOUSEHOLD, address: ADDRESS, status: "revoked" }] });
    expect(await resolveRecipientHouseholds(db.client, [ADDRESS])).toEqual([]);
  });

  it("unknown recipient", async () => {
    const db = withAddresses();
    expect(await resolveRecipientHouseholds(db.client, ["someone@inbox.wonderhome.test"])).toEqual([]);
  });

  it("multiple recipients", async () => {
    const db = withAddresses([{ household_id: OTHER_HOUSEHOLD, address: "hs-rao@inbox.wonderhome.test", status: "active" }]);
    const households = await resolveRecipientHouseholds(db.client, [`Mehta Home <${ADDRESS.toUpperCase()}>`, "hs-rao@inbox.wonderhome.test", ADDRESS, "friend@example.org"]);
    expect(households.sort()).toEqual([HOUSEHOLD, OTHER_HOUSEHOLD].sort());
  });

  it("safe body + malicious attachment", async () => {
    const db = withAddresses();
    const { item } = await receive(db);
    const { classify, seen } = model(reading({ kind: "school_item", title: "Sports Day" }));
    const outcome = await ingestEmailAttachment(db.client, { householdId: HOUSEHOLD, parentItemId: item.id, externalId: "email-1:att-x", bytes: PDF, claimedType: "application/pdf", filename: "invoice.pdf" }, { classify, scan: async () => ({ scanned: true, clean: false }) });
    expect(outcome).toMatchObject({ state: "failed", failureReason: "security_rejected" });
    expect(seen).toHaveLength(0);
    expect(db.tables.home_send_items?.find((row) => row.id === item.id)).toMatchObject({ raw_text: "Sports Day is Saturday 26 September." });
  });

  it("unreadable attachment", async () => {
    const db = withAddresses();
    const { item } = await receive(db);
    const { classify } = model(reading({ readable: false }));
    const outcome = await ingestEmailAttachment(db.client, { householdId: HOUSEHOLD, parentItemId: item.id, externalId: "email-1:att-blur", bytes: PNG, claimedType: "image/png", filename: "blur.png" }, { classify, scan });
    expect(outcome).toMatchObject({ state: "failed", failureReason: "unreadable" });
  });

  it("sender not matching a household member", async () => {
    // The sender is evidence, never an identity: the item belongs to no
    // member, and nothing it proposes is applied without one (§12).
    const db = withAddresses();
    const { item } = await receive(db, received({ from: "Unknown <promo@elsewhere.example>" }));
    expect(item).toMatchObject({ createdByMemberId: null, senderAddress: "Unknown <promo@elsewhere.example>" });
    const decision = decideConfirmation({ kind: "grocery_item", extracted: { title: "Milk", needs: [], confidence: "high" }, understanding: null, reconciliation: null, subject: null, memberInitiated: false, autonomy: "execute" });
    expect(decision.mode).toBe("prepare");
  });
});

describe("§20 acceptance matrix — Reconciliation", () => {
  const exhibition = schoolItem("s-sci", "asmi", "Science Exhibition", "2026-09-28T04:30:00Z");

  it("exact match", () => {
    const found = reconcile(contextItems({ schoolItems: [exhibition] }), { kind: "school_item", title: "Science Exhibition", date: "2026-09-28", subjectMemberId: "asmi" });
    expect(found).toMatchObject({ verdict: "exact_match", proposal: { type: "duplicate" }, existingId: "s-sci" });
    expect(found?.message).toBe("I found Asmi's existing Science Exhibition for 28 Sep. This looks like the same one — keep the existing one, or add this as new?");
  });

  it("near match", () => {
    const found = reconcile(contextItems({ schoolItems: [exhibition] }), { kind: "school_item", title: "Science exhibition", date: "2026-09-29", subjectMemberId: "asmi" });
    expect(found?.existingId).toBe("s-sci");
    expect(found?.proposal.type).toBe("duplicate");
  });

  it("duplicate", () => {
    const found = reconcile(contextItems({ obligations: [bill("b-elec", "Electricity bill")] }), { kind: "bill", title: "Electricity bill", payee: "City Power", amount: 1240.5, date: "2026-10-05" });
    expect(found).toMatchObject({ proposal: { type: "duplicate" }, existingId: "b-elec" });
  });

  it("update", () => {
    const found = reconcile(contextItems({ schoolItems: [exhibition] }), { kind: "school_item", title: "Science Exhibition", date: "2026-09-29", subjectMemberId: "asmi", change: "update" });
    expect(found?.message).toBe("I found Asmi's existing Science Exhibition for 28 Sep. This message says it moved to 29 Sep. Update the existing event?");
  });

  it("cancellation", () => {
    const found = reconcile(contextItems({ schoolItems: [exhibition] }), { kind: "school_item", title: "Science Exhibition", subjectMemberId: "asmi", change: "cancellation" });
    expect(found?.proposal).toEqual({ type: "cancellation" });
  });

  it("conflict", () => {
    // The record was changed after this message was written: it stands, and
    // the difference is shown rather than applied.
    const items = contextItems({ obligations: [bill("b-elec", "Electricity bill", { dueOn: "2026-10-08" })] }).map((item) =>
      item.entityId === "b-elec" ? { ...item, source: { ...item.source, capturedAt: "2026-09-22T12:00:00Z" } } : item,
    );
    const found = reconcile(items, { kind: "bill", title: "Electricity bill", payee: "City Power", amount: 1240.5, date: "2026-10-05", capturedAt: "2026-09-20T09:00:00Z" });
    expect(found).toMatchObject({ verdict: "contradiction", proposal: { type: "conflict" } });
    expect(found?.message).toMatch(/^I found the existing Electricity bill for 8 Oct\. It was changed after this message was written/);
  });

  it("two children with similar records", () => {
    const items = contextItems({ schoolItems: [exhibition, schoolItem("s-sci-m", "manan", "Science Exhibition", "2026-09-28T04:30:00Z")] });
    const found = reconcile(items, { kind: "school_item", title: "Science Exhibition", date: "2026-09-29", subjectMemberId: "manan", change: "update" });
    expect(found?.existingId).toBe("s-sci-m");
    expect(found?.message).toMatch(/^I found Manan's existing/);
  });
});
