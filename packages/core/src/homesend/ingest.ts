import type { SupabaseClient } from "@supabase/supabase-js";

import { rateLimitMessage } from "../security/rate-limit";
import type { IntakeContext, IntakeExtraction, IntakeSource } from "../ai/classify-intake";
import type { AudioClip } from "../voice/provider";
import { gateTranscript, uncertainTranscriptPrompt } from "./audio";
import { detectInstructionInjection, type InjectionScan } from "./injection";
import type { HomeSendExtraction, HomeSendFailureReason, HomeSendKind, HomeSendSource } from "./items";
import { FAILURE_REASON_COPY } from "./items";
import { fetchLinkSafely, LINK_FAILURE_COPY, type LinkContent } from "./link-fetch";
import { platformMalwareScanConfig, scanForMalware, type MalwareScanOutcome } from "./malware-scan";
import { asLoneUrl, audioDurationSeconds, contentHash, decodeTextFile, detectIntakeFile, MAX_AUDIO_SECONDS, MAX_BYTES, MAX_PDF_PAGES, normalizeText, pdfPageCount, type IntakeFileType } from "./normalize";
import { createHomeSendItem, findByExternalId, findPendingByContentHash, markHomeSendFailed, setHomeSendClassification } from "./repository";
import { buildUnderstanding, unreadableUnderstanding, type IntakeUnderstanding, type UnderstandingMeta } from "./understanding";

/**
 * HomeSend's one pipeline (Wave 3 §1, §21: "all inputs use the same
 * canonical understanding pipeline").
 *
 *   Input → secure intake → normalize → understand → canonical understanding
 *
 * Every entry point — the upload and paste forms, the composer's paperclip,
 * the PWA share target, a resumed share handoff — calls one of the three
 * `ingest*` functions here, and every one ends in `understand`. Nothing in
 * this file writes outside `home_send_items` and the private `home-send`
 * bucket: routing into a domain table stays a separate, confirmed step.
 *
 * Every provider is behind `IngestDeps`, so tests run the whole pipeline
 * with a stand-in model, speech service and web.
 */

export type IngestActor = { householdId: string; memberId: string };

export type ClassifyResult = IntakeExtraction | null | "no_provider";

export type TranscribeResult =
  | { status: "transcribed"; text: string; confidence: number }
  | { status: "unavailable" }
  | { status: "failed" };

export type IngestDeps = {
  classify?: (householdId: string, source: IntakeSource, context: IntakeContext) => Promise<ClassifyResult>;
  transcribe?: (supabase: SupabaseClient, householdId: string, clip: AudioClip) => Promise<TranscribeResult>;
  fetchLink?: (url: string) => Promise<LinkContent>;
  scan?: (bytes: Uint8Array, contentType: string) => Promise<MalwareScanOutcome>;
  /** Counts one outbound link fetch against the member's limit (Wave 5 §15); false means over it. */
  limit?: (bucket: "homesend.link") => Promise<boolean>;
};

export type IngestState = "needs_review" | "check_transcript" | "failed";

export type IngestOutcome = {
  itemId: string;
  /**
   * The provider was configured but could not be reached, or gave nothing
   * back (Wave 5 §16). The item is kept and waits for a person, and the
   * reading is worth retrying later. Distinct from "no provider at all".
   */
  classifyFailed?: boolean;
  /** The same content was already waiting; nothing new was created (§15). */
  duplicate: boolean;
  state: IngestState;
  notice: string;
  item: { id: string; classifiedKind: HomeSendKind; extracted: HomeSendExtraction | null; understanding: IntakeUnderstanding | null };
  failureReason?: HomeSendFailureReason;
  /** For a voice note WonderHome is not sure it heard right (§17). */
  heard?: { text: string; confidence: number; prompt: string };
};

/** Refused before anything was kept — too big to take in, or nothing there. */
export class IngestRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestRejected";
  }
}

export function emptyExtraction(): HomeSendExtraction {
  return {
    title: null, notes: null, billKind: null, payee: null, amount: null, currency: null,
    dueDate: null, schoolKind: null, subject: null, quantity: null, unit: null, category: null,
    healthRecordType: null, documentDate: null, merchant: null, lines: [], subjectMemberName: null,
    secondary: null,
  };
}

function toStoredExtraction(extraction: IntakeExtraction): HomeSendExtraction {
  return {
    title: extraction.title,
    notes: extraction.notes,
    billKind: extraction.billKind,
    payee: extraction.payee,
    amount: extraction.amount,
    currency: extraction.currency,
    dueDate: extraction.dueDate,
    dueTime: extraction.dueTime ?? null,
    endTime: extraction.endTime ?? null,
    schoolKind: extraction.schoolKind,
    subject: extraction.subject,
    quantity: extraction.quantity,
    unit: extraction.unit,
    category: extraction.category,
    healthRecordType: extraction.healthRecordType,
    documentDate: extraction.documentDate,
    merchant: extraction.merchant,
    lines: extraction.lines,
    subjectMemberName: extraction.subjectMemberName,
    secondary: extraction.secondary,
    summary: extraction.summary,
    people: extraction.people,
    needs: extraction.needs,
    change: extraction.change,
    confidence: extraction.confidence,
  };
}

/** The household's timezone, or null when it cannot be read (then no date phrase is grounded). */
async function householdTimezone(supabase: SupabaseClient, householdId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("households").select("timezone").eq("id", householdId).maybeSingle();
    return typeof data?.timezone === "string" && data.timezone ? data.timezone : null;
  } catch {
    return null;
  }
}

// ---- default providers -----------------------------------------------------

const defaultClassify: NonNullable<IngestDeps["classify"]> = async (householdId, source, context) => {
  const { readHouseholdKey } = await import("../ai/credentials");
  const { resolveModelKey, platformKey } = await import("../ai/model-key");
  const { classifyIntake } = await import("../ai/classify-intake");
  const householdKey = await readHouseholdKey(householdId).catch(() => null);
  const key = resolveModelKey(householdKey, platformKey());
  if (key.source === "none" || !key.provider || !key.key) return "no_provider";
  return classifyIntake(key.provider, key.key, source, context);
};

const defaultTranscribe: NonNullable<IngestDeps["transcribe"]> = async (supabase, householdId, clip) => {
  const { loadVoiceSettings, resolveProvider } = await import("../voice/repository");
  const settings = await loadVoiceSettings(supabase, householdId);
  // A voice note needs a server-side speech service whatever the household
  // picked for live conversation — the browser cannot transcribe a file.
  const provider = await resolveProvider({ ...settings, provider: "google" }, householdId);
  if (!provider.live) return { status: "unavailable" };
  try {
    const heard = await provider.listen({ clip, settings });
    return { status: "transcribed", text: heard.text, confidence: heard.confidence };
  } catch {
    return { status: "failed" };
  }
};

const defaultScan: NonNullable<IngestDeps["scan"]> = (bytes, contentType) => scanForMalware(bytes, contentType, platformMalwareScanConfig());

// ---- understanding ---------------------------------------------------------

export type UnderstandInput = {
  source: IntakeSource;
  channel: HomeSendSource;
  context?: IntakeContext;
  /** Text read from the content, when there is some — scanned for instructions aimed at WonderHome, and saved with the item. */
  text?: string | null;
  transcriptConfidence?: number | null;
  /** The file's real type, when the content is a file. */
  contentType?: string | null;
  /** How many pages the file has, from its bytes (a PDF). */
  pageCount?: number | null;
};

/** The longest text kept with an item — the table's own limit. */
const MAX_STORED_TEXT = 12_000;

function scanOutput(extraction: IntakeExtraction): InjectionScan {
  return detectInstructionInjection(
    extraction.notes,
    extraction.summary,
    ...extraction.facts.flatMap((fact) => [fact.statement, fact.evidence]),
    // Every record the whole document proposes is content too (DDU 2.0 §39).
    ...(extraction.records ?? []).flatMap((record) => [record.title, record.notes, record.evidence.quote]),
  );
}

/**
 * The "AI understand → extract structured facts" steps, the same for every
 * input. Classification is a convenience, never the point: an outage, a
 * refusal or no provider at all leaves the item waiting for a person to
 * fill in by hand; content nobody could read fails safely.
 */
export async function understand(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  input: UnderstandInput,
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const classify = deps.classify ?? defaultClassify;
  const inputScan = detectInstructionInjection(input.text, input.context?.subject);
  const meta = (injection: InjectionScan): UnderstandingMeta => ({
    channel: input.channel,
    transcriptConfidence: input.transcriptConfidence ?? null,
    url: input.context?.url ?? null,
    subject: input.context?.subject ?? null,
    sender: input.context?.from ?? null,
    filename: input.context?.filename ?? null,
    contentType: input.contentType ?? null,
    pageCount: input.pageCount ?? null,
    injection,
  });

  // The reference day a date phrase is resolved against — when the content
  // arrived, in the household's own timezone (Wave 4 §7 applied to intake).
  const context: IntakeContext = {
    ...input.context,
    now: input.context?.now ?? new Date(),
    timezone: input.context?.timezone ?? (await householdTimezone(supabase, householdId)),
  };

  let result: ClassifyResult;
  try {
    result = await classify(householdId, input.source, context);
  } catch {
    result = null;
  }

  if (result === "no_provider" || result === null) {
    const understanding = unreadableUnderstanding(meta(inputScan));
    await setHomeSendClassification(supabase, householdId, itemId, {
      classifiedKind: "unknown",
      extracted: emptyExtraction(),
      understanding,
      rawText: input.text ? input.text.slice(0, MAX_STORED_TEXT) : null,
      transcriptConfidence: input.transcriptConfidence ?? undefined,
    });
    return {
      itemId,
      duplicate: false,
      ...(result === null ? { classifyFailed: true } : {}),
      state: "needs_review",
      notice:
        result === "no_provider"
          ? "No AI provider is set up for this household yet — you can still tell WonderHome what this is below."
          : "WonderHome couldn't read that just now — please fill in the details below by hand.",
      item: { id: itemId, classifiedKind: "unknown", extracted: null, understanding },
    };
  }

  const injection = { flagged: inputScan.flagged || scanOutput(result).flagged, signals: [...new Set([...inputScan.signals, ...scanOutput(result).signals])] };

  if (!result.readable) {
    const understanding = unreadableUnderstanding(meta(injection));
    await markHomeSendFailed(supabase, householdId, itemId, "unreadable", { rawText: input.text ? input.text.slice(0, MAX_STORED_TEXT) : null, understanding });
    return {
      itemId,
      duplicate: false,
      state: "failed",
      failureReason: "unreadable",
      notice: FAILURE_REASON_COPY.unreadable,
      item: { id: itemId, classifiedKind: "unknown", extracted: null, understanding },
    };
  }

  const understanding = buildUnderstanding(result, meta(injection));
  const extracted = toStoredExtraction(result);
  await setHomeSendClassification(supabase, householdId, itemId, {
    classifiedKind: result.kind,
    extracted,
    understanding,
    rawText: input.text ? input.text.slice(0, MAX_STORED_TEXT) : null,
    transcriptConfidence: input.transcriptConfidence ?? undefined,
  });
  return {
    itemId,
    duplicate: false,
    state: "needs_review",
    notice: injection.flagged
      ? "Filled in from what you sent. It also contained instructions aimed at WonderHome — those were ignored. Check it over before adding."
      : "Filled in from what you sent — check it over before adding.",
    item: { id: itemId, classifiedKind: result.kind, extracted, understanding },
  };
}

// ---- entry points ----------------------------------------------------------

async function existingDuplicate(supabase: SupabaseClient, householdId: string, hash: string): Promise<IngestOutcome | null> {
  const existing = await findPendingByContentHash(supabase, householdId, hash).catch(() => null);
  if (!existing) return null;
  const unheard =
    existing.source === "audio_note" && existing.classifiedKind === "unknown" && existing.rawText && existing.transcriptConfidence !== null && existing.transcriptConfidence < 1
      ? gateTranscript({ text: existing.rawText, confidence: existing.transcriptConfidence })
      : null;
  return {
    itemId: existing.id,
    duplicate: true,
    state: unheard?.outcome === "uncertain" ? "check_transcript" : "needs_review",
    notice: "You already sent this — it's waiting for your review.",
    item: { id: existing.id, classifiedKind: existing.classifiedKind ?? "unknown", extracted: existing.extracted, understanding: existing.understanding },
    ...(unheard?.outcome === "uncertain" ? { heard: { text: unheard.text, confidence: unheard.confidence, prompt: uncertainTranscriptPrompt(unheard) } } : {}),
  };
}

function failedOutcome(itemId: string, reason: HomeSendFailureReason, notice?: string): IngestOutcome {
  return {
    itemId,
    duplicate: false,
    state: "failed",
    failureReason: reason,
    notice: notice ?? FAILURE_REASON_COPY[reason],
    item: { id: itemId, classifiedKind: "unknown", extracted: null, understanding: null },
  };
}

export type IngestFileInput = {
  bytes: Uint8Array;
  claimedType: string;
  filename?: string | null;
};

/**
 * A photo, PDF, text file or voice note (§3). The file is kept in the
 * private bucket whatever happens next — the bucket is the quarantine — and
 * only a file whose bytes are what they claim, and that no configured
 * scanner flagged, is ever read.
 */
export async function ingestFile(supabase: SupabaseClient, actor: IngestActor, input: IngestFileInput, deps: IngestDeps = {}): Promise<IngestOutcome> {
  return ingestFileFor(supabase, { householdId: actor.householdId, memberId: actor.memberId, parentItemId: null, externalId: null }, input, deps);
}

/**
 * A file that came with a forwarded email (§7): treated exactly like any
 * other HomeSend file — type from its bytes, security checks, quarantine,
 * understanding — and kept as its own item, attached to its email. A
 * malicious or unreadable attachment fails safely on its own; the email's
 * text is already kept and is never lost because of it. Called with the
 * admin client from the webhook, which has no member session.
 */
export async function ingestEmailAttachment(
  supabase: SupabaseClient,
  input: IngestFileInput & { householdId: string; parentItemId: string; externalId: string; subject?: string | null; sender?: string | null },
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const existing = await findByExternalId(supabase, input.householdId, input.externalId).catch(() => null);
  if (existing) {
    return {
      itemId: existing.id,
      duplicate: true,
      state: existing.status === "failed" ? "failed" : "needs_review",
      notice: "Already received.",
      item: { id: existing.id, classifiedKind: existing.classifiedKind ?? "unknown", extracted: existing.extracted, understanding: existing.understanding },
    };
  }
  return ingestFileFor(
    supabase,
    { householdId: input.householdId, memberId: null, parentItemId: input.parentItemId, externalId: input.externalId, subject: input.subject ?? null, sender: input.sender ?? null },
    input,
    deps,
  );
}

type FileOwner = {
  householdId: string;
  memberId: string | null;
  parentItemId: string | null;
  externalId: string | null;
  subject?: string | null;
  sender?: string | null;
  /** Sent to WonderHome's WhatsApp number by a linked member. */
  viaWhatsApp?: boolean;
};

/**
 * A message a linked member sent to WonderHome's WhatsApp number (the
 * WhatsApp HomeSend spec). Called from the webhook's processing with the
 * admin client: the member and household come from the verified link, never
 * from the message. Kept as its own item, keyed by WhatsApp's message id, so
 * a retried delivery is one item.
 */
export async function ingestWhatsAppText(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; externalId: string; text: string },
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const already = await alreadyReceived(supabase, input.householdId, input.externalId);
  if (already) return already;

  // A bare link stays a WhatsApp item (its source and its message id are the
  // record); the model reads the address as text rather than WonderHome
  // fetching it.
  const text = normalizeText(input.text);
  if (!text) throw new IngestRejected("That message was empty.");
  const hash = await contentHash(text);
  const duplicate = await existingDuplicate(supabase, input.householdId, hash);
  if (duplicate) return duplicate;

  const itemId = crypto.randomUUID();
  await createHomeSendItem(supabase, {
    id: itemId,
    householdId: input.householdId,
    createdByMemberId: input.memberId,
    source: "whatsapp",
    rawText: text,
    contentType: "text/plain",
    contentHash: hash,
    externalId: input.externalId,
  });
  return understand(supabase, input.householdId, itemId, { source: { text }, channel: "whatsapp", context: WHATSAPP_CONTEXT, text }, deps);
}

/** A photo, document or voice note a linked member sent on WhatsApp, with its caption. */
export async function ingestWhatsAppMedia(
  supabase: SupabaseClient,
  input: IngestFileInput & { householdId: string; memberId: string; externalId: string; caption?: string | null },
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const already = await alreadyReceived(supabase, input.householdId, input.externalId);
  if (already) return already;
  const caption = input.caption ? normalizeText(input.caption).slice(0, 300) || null : null;
  return ingestFileFor(
    supabase,
    { householdId: input.householdId, memberId: input.memberId, parentItemId: null, externalId: input.externalId, subject: caption, viaWhatsApp: true },
    input,
    deps,
  );
}

/** What the model is told about where a WhatsApp item came from: a channel, never a number. */
const WHATSAPP_CONTEXT: IntakeContext = { channel: "a message a household member sent or forwarded to WonderHome on WhatsApp" };

async function alreadyReceived(supabase: SupabaseClient, householdId: string, externalId: string): Promise<IngestOutcome | null> {
  const existing = await findByExternalId(supabase, householdId, externalId).catch(() => null);
  if (!existing) return null;
  return {
    itemId: existing.id,
    duplicate: true,
    state: existing.status === "failed" ? "failed" : "needs_review",
    notice: "Already received.",
    item: { id: existing.id, classifiedKind: existing.classifiedKind ?? "unknown", extracted: existing.extracted, understanding: existing.understanding },
  };
}

async function ingestFileFor(supabase: SupabaseClient, owner: FileOwner, input: IngestFileInput, deps: IngestDeps): Promise<IngestOutcome> {
  const actor = { householdId: owner.householdId, memberId: owner.memberId ?? "" };
  const isAttachment = owner.parentItemId !== null;
  if (input.bytes.length === 0) throw new IngestRejected("That file is empty.");
  if (input.bytes.length > MAX_BYTES.audio) throw new IngestRejected("That file is too large — please use one under 10MB.");

  const hash = await contentHash(input.bytes);
  if (!isAttachment) {
    const duplicate = await existingDuplicate(supabase, actor.householdId, hash);
    if (duplicate) return duplicate;
  }

  const detected = detectIntakeFile(input.bytes, input.claimedType, input.filename ?? null);
  if (detected.ok && input.bytes.length > MAX_BYTES[detected.family]) {
    throw new IngestRejected(detected.family === "text" ? "That text file is too large — please paste the part that matters." : "That file is too large — please use one under 8MB.");
  }

  const storedType: string = detected.ok ? detected.type : "application/octet-stream";
  const family = detected.ok ? detected.family : null;
  let failureReason: HomeSendFailureReason | null = null;
  let notice: string | undefined;
  if (!detected.ok) {
    failureReason = detected.reason === "mismatched_type" ? "security_rejected" : "unsupported_type";
    if (detected.reason === "unsupported_audio") notice = "That voice note is in a format (like .m4a) WonderHome can't hear yet — please record or share it as MP3, OGG, WebM or WAV.";
    if (detected.reason === "mismatched_type") notice = "That file isn't what it says it is, so WonderHome kept it without looking inside.";
  } else if (detected.family === "document" && pdfPageCount(input.bytes) > MAX_PDF_PAGES) {
    // Kept, not read (Wave 5 §15): a document this long is not what a
    // household sends WonderHome to act on, and reading it is not free.
    failureReason = "too_large";
    notice = `That PDF has more than ${MAX_PDF_PAGES} pages — please send just the pages that matter.`;
  } else if (detected.family === "audio" && (audioDurationSeconds(input.bytes, detected.type) ?? 0) > MAX_AUDIO_SECONDS) {
    failureReason = "too_large";
    notice = `That voice note is longer than ${MAX_AUDIO_SECONDS / 60} minutes — please send a shorter one.`;
  } else {
    const scanned = await (deps.scan ?? defaultScan)(input.bytes, storedType).catch((): MalwareScanOutcome => ({ scanned: false }));
    if (scanned.scanned && !scanned.clean) {
      failureReason = "security_rejected";
      notice = "That file didn't pass the safety check, so WonderHome kept it without looking inside.";
    }
  }

  const itemId = crypto.randomUUID();
  const path = `${actor.householdId}/${itemId}`;
  const { error: uploadError } = await supabase.storage.from("home-send").upload(path, input.bytes, { contentType: storedType });
  if (uploadError) throw new Error(`home-send upload failed: ${uploadError.message}`);

  await createHomeSendItem(supabase, {
    id: itemId,
    householdId: actor.householdId,
    createdByMemberId: owner.memberId,
    source: isAttachment ? "email_attachment" : owner.viaWhatsApp ? "whatsapp_media" : family === "audio" ? "audio_note" : "manual_upload",
    filePath: path,
    securityStatus: failureReason === "security_rejected" ? "rejected" : "clean",
    contentType: storedType,
    contentHash: hash,
    failureReason,
    parentItemId: owner.parentItemId,
    externalId: owner.externalId,
    subject: owner.subject ?? null,
    senderAddress: owner.sender ?? null,
  });
  if (failureReason || !detected.ok) return failedOutcome(itemId, failureReason ?? "unsupported_type", notice);

  const channel: HomeSendSource = isAttachment ? "email_attachment" : owner.viaWhatsApp ? "whatsapp_media" : "manual_upload";
  const context: IntakeContext = {
    channel: owner.viaWhatsApp
      ? family === "audio"
        ? "a voice note a household member sent to WonderHome on WhatsApp"
        : "a file a household member sent or forwarded to WonderHome on WhatsApp, with its caption as the subject"
      : isAttachment
        ? "an attachment to a forwarded email"
        : family === "audio"
          ? "a voice note"
          : "an uploaded file",
    filename: input.filename ?? null,
    subject: owner.subject ?? null,
    from: owner.sender ?? null,
  };
  const base64 = () => Buffer.from(input.bytes).toString("base64");

  switch (detected.family) {
    case "image":
      return understand(supabase, actor.householdId, itemId, { source: { image: { mediaType: detected.type as "image/jpeg" | "image/png" | "image/webp", base64: base64() } }, channel, context, contentType: detected.type, pageCount: 1 }, deps);
    case "document":
      return understand(supabase, actor.householdId, itemId, { source: { document: { mediaType: "application/pdf", base64: base64() } }, channel, context, contentType: detected.type, pageCount: pdfPageCount(input.bytes) || null }, deps);
    case "text": {
      const text = normalizeText(decodeTextFile(input.bytes) ?? "");
      if (!text) {
        await markHomeSendFailed(supabase, actor.householdId, itemId, "unreadable");
        return failedOutcome(itemId, "unreadable");
      }
      return understand(supabase, actor.householdId, itemId, { source: { text }, channel, context, text, contentType: detected.type }, deps);
    }
    case "audio":
      // A voice note forwarded by email is still a voice note: heard, gated
      // on its transcript, never acted on when uncertain.
      return hearVoiceNote(supabase, actor, itemId, { base64: base64(), mimeType: detected.type }, deps);
  }
}

async function hearVoiceNote(supabase: SupabaseClient, actor: IngestActor, itemId: string, clip: AudioClip, deps: IngestDeps): Promise<IngestOutcome> {
  const transcribe = deps.transcribe ?? defaultTranscribe;
  const heard = await transcribe(supabase, actor.householdId, clip).catch((): TranscribeResult => ({ status: "failed" }));
  if (heard.status !== "transcribed") {
    const reason = heard.status === "unavailable" ? "transcription_unavailable" : "transcription_failed";
    await markHomeSendFailed(supabase, actor.householdId, itemId, reason);
    return failedOutcome(itemId, reason);
  }

  const gate = gateTranscript(heard);
  if (gate.outcome === "empty") {
    await markHomeSendFailed(supabase, actor.householdId, itemId, "transcription_failed");
    return failedOutcome(itemId, "transcription_failed", "WonderHome couldn't hear any words in that voice note.");
  }
  if (gate.outcome === "uncertain") {
    // Shown, never acted on (§17): the transcript waits for the household
    // to confirm it or type what was said, and nothing reads it until then.
    const understanding = unreadableUnderstanding({ channel: "audio_note", transcriptConfidence: gate.confidence, injection: detectInstructionInjection(gate.text) });
    await setHomeSendClassification(supabase, actor.householdId, itemId, {
      classifiedKind: "unknown",
      extracted: emptyExtraction(),
      understanding,
      rawText: gate.text,
      transcriptConfidence: gate.confidence,
    });
    return {
      itemId,
      duplicate: false,
      state: "check_transcript",
      notice: uncertainTranscriptPrompt(gate),
      item: { id: itemId, classifiedKind: "unknown", extracted: null, understanding },
      heard: { text: gate.text, confidence: gate.confidence, prompt: uncertainTranscriptPrompt(gate) },
    };
  }
  return understand(
    supabase,
    actor.householdId,
    itemId,
    { source: { text: gate.text }, channel: "audio_note", context: { channel: "a voice note, transcribed" }, text: gate.text, transcriptConfidence: gate.confidence },
    deps,
  );
}

/**
 * The household checked what WonderHome heard, and either confirmed it or
 * typed what was really said. Their words are certain in a way a
 * transcript never is, so they are read at full confidence.
 */
export async function confirmTranscript(
  supabase: SupabaseClient,
  actor: IngestActor,
  input: { itemId: string; text: string },
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const text = normalizeText(input.text);
  if (!text) throw new IngestRejected("Type what the voice note said first.");
  return understand(
    supabase,
    actor.householdId,
    input.itemId,
    { source: { text }, channel: "audio_note", context: { channel: "a voice note, as the household confirmed it" }, text, transcriptConfidence: 1 },
    deps,
  );
}

/**
 * Pasted or shared text (§3). A message that is nothing but one web
 * address is a link, and goes the link's way.
 */
export async function ingestText(
  supabase: SupabaseClient,
  actor: IngestActor,
  input: { text: string },
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const url = asLoneUrl(input.text);
  if (url) return ingestLink(supabase, actor, { url }, deps);

  const text = normalizeText(input.text);
  if (!text) throw new IngestRejected("Paste something first.");
  const hash = await contentHash(text);
  const duplicate = await existingDuplicate(supabase, actor.householdId, hash);
  if (duplicate) return duplicate;

  const itemId = crypto.randomUUID();
  await createHomeSendItem(supabase, {
    id: itemId,
    householdId: actor.householdId,
    createdByMemberId: actor.memberId,
    source: "pasted_text",
    rawText: text,
    contentType: "text/plain",
    contentHash: hash,
  });
  return understand(supabase, actor.householdId, itemId, { source: { text }, channel: "pasted_text", context: { channel: "pasted or forwarded text" }, text }, deps);
}

/**
 * A shared web address (§3): validated, fetched safely (`link-fetch.ts`),
 * reduced to readable text, then understood like anything else. A link that
 * cannot or must not be opened is kept, failed safely, with the reason.
 */
export async function ingestLink(
  supabase: SupabaseClient,
  actor: IngestActor,
  input: { url: string },
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  const url = input.url.trim();
  const hash = await contentHash(url);
  const duplicate = await existingDuplicate(supabase, actor.householdId, hash);
  if (duplicate) return duplicate;
  // Every new link is an outbound fetch, so each counts against the limit
  // before anything is fetched or stored.
  if (deps.limit && !(await deps.limit("homesend.link"))) throw new IngestRejected(rateLimitMessage("homesend.link"));

  const itemId = crypto.randomUUID();
  await createHomeSendItem(supabase, {
    id: itemId,
    householdId: actor.householdId,
    createdByMemberId: actor.memberId,
    source: "link",
    sourceUrl: url.slice(0, 2048),
    contentHash: hash,
  });

  const fetched = await (deps.fetchLink ?? ((address: string) => fetchLinkSafely(address)))(url).catch((): LinkContent => ({ ok: false, reason: "unreachable" }));
  if (!fetched.ok) {
    const reason: HomeSendFailureReason = fetched.reason === "invalid_url" || fetched.reason === "blocked_address" ? "link_blocked" : fetched.reason === "too_large" ? "too_large" : "link_unreachable";
    await markHomeSendFailed(supabase, actor.householdId, itemId, reason);
    return failedOutcome(itemId, reason, LINK_FAILURE_COPY[fetched.reason]);
  }

  if (fetched.kind === "pdf") {
    return understand(
      supabase,
      actor.householdId,
      itemId,
      { source: { document: { mediaType: "application/pdf", base64: Buffer.from(fetched.bytes).toString("base64") } }, channel: "link", context: { channel: "a shared link to a PDF", url: fetched.finalUrl } },
      deps,
    );
  }
  const text = [fetched.title, fetched.text].filter(Boolean).join("\n\n");
  return understand(supabase, actor.householdId, itemId, { source: { text }, channel: "link", context: { channel: "a shared web page", url: fetched.finalUrl }, text }, deps);
}

export type { IntakeFileType };
