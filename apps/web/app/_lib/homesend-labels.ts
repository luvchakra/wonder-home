import type { ReceiptAction } from "@wonderhome/core/homesend/apply";
import type { HomeSendFailureReason } from "@wonderhome/core/homesend/items";
import type { PlanAction, PlanGroup } from "@wonderhome/core/homesend/plan";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import type { Translate, TranslationKey, TranslationParams } from "@wonderhome/core/i18n/translate";

/**
 * HomeSend's words in the viewer's language (story 22-004).
 *
 * Built on the server, where the catalog is, and handed to the client
 * components as plain strings. What was sent in — a title, a name, a quote,
 * a page's evidence — is never here: it is the household's own content and
 * is shown exactly as it was read. A placeholder the client fills in (a
 * title, a count) is kept as `{name}` and filled with `fillIn`.
 *
 * This module holds no catalog of its own, so importing `fillIn` or
 * `countWords` into a client component brings no language data with it.
 */

/**
 * A sentence with a count in it, rendered here so each language keeps its own
 * plural forms: every count up to `COUNTED_UP_TO` exactly, and beyond that one
 * template per plural category of the language, chosen on the client by the
 * same `Intl.PluralRules` the translator uses.
 */
export type CountedWords = { upTo: string[]; beyond: Partial<Record<Intl.LDMLPluralRule, string>>; language: string };

const COUNTED_UP_TO = 30;

/** Far above anything a household sends, so the figure can be told apart from the words around it. */
const SAMPLE_FROM = 1_000_000;

function pluralRules(language: string): Intl.PluralRules {
  try {
    return new Intl.PluralRules(language);
  } catch {
    return new Intl.PluralRules("en");
  }
}

function counted(t: Translate, key: TranslationKey, params: TranslationParams, language: string): CountedWords {
  const rules = pluralRules(language);
  const beyond: CountedWords["beyond"] = {};
  for (let sample = SAMPLE_FROM; sample < SAMPLE_FROM + 200; sample += 1) {
    const category = rules.select(sample);
    if (!beyond[category]) beyond[category] = t(key, { ...params, count: sample }).split(String(sample)).join("{count}");
  }
  return { upTo: Array.from({ length: COUNTED_UP_TO + 1 }, (_, count) => t(key, { ...params, count })), beyond, language };
}

/** The sentence for `count`, with any other placeholders filled in. */
export function countWords(words: CountedWords, count: number, params: Record<string, string> = {}): string {
  const exact = words.upTo[count];
  if (exact !== undefined) return fillIn(exact, params);
  const template = words.beyond[pluralRules(words.language).select(count)] ?? words.beyond.other ?? "";
  return fillIn(template, { ...params, count });
}

/** `{name}` → its value; a placeholder with no value is dropped, never shown with its braces. */
export function fillIn(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Month names for "23 Sep", in the viewer's language — Latin digits, the calendar the rest of the app uses. */
function shortMonths(language: string): string[] {
  const make = (tag: string) => new Intl.DateTimeFormat(`${tag}-u-nu-latn-ca-gregory`, { month: "short", timeZone: "UTC" });
  let format: Intl.DateTimeFormat;
  try {
    format = make(language);
  } catch {
    format = make("en");
  }
  return Array.from({ length: 12 }, (_, month) => format.format(new Date(Date.UTC(2026, month, 15))));
}

export type HomeSendSourceLabels = {
  /** By the item's channel ("manual_upload", "email", …). */
  channel: Record<string, string>;
  /** By a file's own type ("application/pdf", …). */
  content: Record<string, string>;
  whatsappPhoto: string;
  whatsappVoice: string;
  whatsappPdf: string;
  something: string;
  webPageOn: string;
  forwardedEmail: string;
  from: string;
  when: string;
  day: string;
  months: string[];
};

/** Everything the review step needs — shared by `/home-send` and HomeTalk's paperclip sheet. */
export type HomeSendReviewLabels = {
  back: string;
  reading: string;
  readThis: string;
  notWorthAdding: string;
  dismissing: string;
  undoing: string;
  sheet: {
    title: string;
    description: string;
    sendFile: string;
    pasteText: string;
    keptFailed: string;
    keptHandled: string;
    choose: string;
    pasteLabel: string;
    pastePlaceholder: string;
  };
  source: HomeSendSourceLabels;
  found: {
    title: string;
    unreadable: string;
    alsoAsks: string;
    source: string;
    confidenceLabel: string;
    confidence: Record<IntakeUnderstanding["confidence"], string>;
    heard: string;
    heardValue: string;
    instructionsIgnored: string;
  };
  transcript: { prompt: string; promptConsequential: string; heard: string; confirm: string };
  confirm: {
    this: string;
    byHand: string;
    foundThings: CountedWords;
    looksUpdate: string;
    looksCancellation: string;
    looksConflict: string;
    looksDuplicate: string;
    thisIs: string;
    alsoGroceries: string;
    updateExisting: string;
    cancelExisting: string;
    keepExisting: string;
    addAsNew: string;
    addAnyway: string;
    recordPurchases: string;
    add: string;
  };
  /** Option labels by their stored value; the value itself never changes. */
  options: {
    kind: Record<string, string>;
    bill: Record<string, string>;
    school: Record<string, string>;
    record: Record<string, string>;
  };
  child: {
    for: string;
    noChildren: string;
    choose: string;
    addNamed: string;
    add: string;
    notOnRecord: string;
    adminCanAdd: string;
    name: string;
    dob: string;
    joins: string;
  };
  field: {
    whatIsIt: string;
    billKind: string;
    payee: string;
    amount: string;
    currency: string;
    due: string;
    schoolKind: string;
    subject: string;
    starts: string;
    startsHint: string;
    ends: string;
    whose: string;
    me: string;
    readName: string;
    whoseHint: string;
    recordType: string;
    documentDate: string;
    quantity: string;
    unit: string;
    unitPlaceholder: string;
    category: string;
    categoryPlaceholder: string;
    notes: string;
  };
  receipt: {
    shop: string;
    boughtOn: string;
    currency: string;
    currencyPlaceholder: string;
    total: string;
    whatBought: string;
    explain: string;
    checking: string;
    addLine: string;
    line: string;
    remove: string;
    removeLine: string;
    howMany: string;
    countedIn: string;
    noUnit: string;
    unitPlaceholder: string;
    lineTotal: string;
    thisIs: string;
    tracked: string;
    new: string;
    skip: string;
    skipped: string;
    addsTo: string;
    startsTracking: string;
    thisItem: string;
    addNew: string;
    chooseExisting: string;
  };
  plan: {
    found: CountedWords;
    lede: string;
    pageUnreadable: string;
    allPagesRead: string;
    somePagesRead: string;
    page: string;
    pages: string;
    group: Record<PlanGroup, string>;
    outcome: Record<PlanAction, string>;
    leftOut: string;
    included: string;
    include: string;
    sourcePage: string;
    source: string;
    sourceWhere: string;
    changesTo: string;
    fromHousehold: string;
    onRecord: string;
    notSure: string;
    edit: string;
    doneEditing: string;
    name: string;
    due: string;
    date: string;
    amount: string;
    applying: string;
    apply: string;
    nothingToChange: string;
    /** By the plan field's own name ("title", "person", …). */
    field: Record<string, string>;
    fieldChild: string;
    fieldDueDate: string;
  };
  applied: {
    action: Record<ReceiptAction, string>;
    allDone: string;
    nothingNew: string;
    nothingApplied: string;
    partialHeadline: string;
    waiting: string;
    changes: CountedWords;
    withWaiting: string;
    noChange: string;
    completed: CountedWords;
    partial: string;
    needsReview: string;
    none: string;
    undo: CountedWords;
    done: string;
  };
};

/** The `/home-send` screen's own words, around the shared review step. */
export type HomeSendPageLabels = {
  review: HomeSendReviewLabels;
  inbox: {
    dropTitle: string;
    dropHint: string;
    chooseFile: string;
    paste: string;
    keptBelow: string;
    pasteLabel: string;
    pastePlaceholder: string;
    undo: string;
    kind: Record<string, string>;
    voiceNote: string;
    needsReview: string;
    failedSafely: string;
    recentlyHandled: string;
    checkHeard: string;
    review: string;
    reviewAria: string;
    fillByHand: string;
    fillByHandAria: string;
    dismiss: string;
    dismissAria: string;
    couldNotRead: string;
    failure: Record<HomeSendFailureReason, string>;
    status: {
      keptExisting: string;
      dismissed: string;
      undone: string;
      recorded: string;
      updated: string;
      cancelled: string;
      added: string;
    };
    updatedOnRecord: string;
    cancelledOnRecord: string;
    addedOnItsOwn: string;
    planned: string;
    bought: string;
    boughtLine: string;
    tracking: string;
    trackingNew: string;
    alsoGroceries: string;
    alsoGroceriesPlain: string;
    undoAdding: string;
    undoUpdating: string;
    undoCancelling: string;
    undoRecording: string;
    undoRecordingLine: string;
    undoAddingGrocery: string;
    undoUpdatingGrocery: string;
    emptyChannelTitle: string;
    emptyChannelDescription: string;
    emptyTitle: string;
    emptyDescription: string;
  };
  channels: {
    title: string;
    whatsappTitle: string;
    whatsappConnected: string;
    whatsappConnect: string;
    emailTitle: string;
    emailActive: string;
    emailRevoked: string;
    emailAdmin: string;
    emailAskAdmin: string;
    copyAria: string;
    copy: string;
    copied: string;
    working: string;
    turnBackOn: string;
    setUp: string;
    rotating: string;
    newAddress: string;
    turningOff: string;
    turnOff: string;
    installTitle: string;
    installBody: string;
    install: string;
    installDescription: string;
    gotIt: string;
    /** By the device the page is open on (`useInstallPrompt`'s platform). */
    installSteps: Record<"ios" | "android" | "desktop" | "unknown", string[]>;
  };
};

/** Placeholders the client fills in, kept as they are. */
const keep = (...names: string[]): TranslationParams => Object.fromEntries(names.map((name) => [name, `{${name}}`]));

export function homesendReviewLabels(t: Translate, language: string): HomeSendReviewLabels {
  return {
    back: t("common.back"),
    reading: t("homesend.reading"),
    readThis: t("homesend.readThis"),
    notWorthAdding: t("homesend.notWorthAdding"),
    dismissing: t("homesend.dismissing"),
    undoing: t("homesend.undoing"),
    sheet: {
      title: t("homesend.sheet.title"),
      description: t("homesend.sheet.description"),
      sendFile: t("homesend.sheet.sendFile"),
      pasteText: t("homesend.sheet.pasteText"),
      keptFailed: t("homesend.sheet.keptFailed"),
      keptHandled: t("homesend.sheet.keptHandled"),
      choose: t("homesend.sheet.choose"),
      pasteLabel: t("homesend.sheet.pasteLabel"),
      pastePlaceholder: t("homesend.sheet.pastePlaceholder"),
    },
    source: {
      channel: {
        manual_upload: t("homesend.source.manualUpload"),
        pasted_text: t("homesend.source.pastedText"),
        link: t("homesend.source.link"),
        audio_note: t("homesend.source.audioNote"),
        email: t("homesend.source.email"),
        email_attachment: t("homesend.source.emailAttachment"),
        whatsapp: t("homesend.source.whatsapp"),
        whatsapp_media: t("homesend.source.whatsappMedia"),
      },
      content: {
        "application/pdf": t("homesend.source.pdf"),
        "text/plain": t("homesend.source.textFile"),
        "text/csv": t("homesend.source.csv"),
        "image/jpeg": t("homesend.source.photo"),
        "image/png": t("homesend.source.photo"),
        "image/webp": t("homesend.source.photo"),
      },
      whatsappPhoto: t("homesend.source.whatsappPhoto"),
      whatsappVoice: t("homesend.source.whatsappVoice"),
      whatsappPdf: t("homesend.source.whatsappPdf"),
      something: t("homesend.source.something"),
      webPageOn: t("homesend.source.webPageOn", keep("host")),
      forwardedEmail: t("homesend.source.forwardedEmail", keep("subject")),
      from: t("homesend.source.from", keep("label", "name")),
      when: t("homesend.source.when", keep("label", "day")),
      day: t("homesend.source.day", keep("day", "month")),
      months: shortMonths(language),
    },
    found: {
      title: t("homesend.found.title"),
      unreadable: t("homesend.found.unreadable"),
      alsoAsks: t("homesend.found.alsoAsks", keep("list")),
      source: t("homesend.found.source"),
      confidenceLabel: t("homesend.found.confidence"),
      confidence: { high: t("homesend.found.high"), medium: t("homesend.found.medium"), low: t("homesend.found.low") },
      heard: t("homesend.found.heard"),
      heardValue: t("homesend.found.heardValue"),
      instructionsIgnored: t("homesend.found.instructionsIgnored"),
    },
    transcript: {
      prompt: t("homesend.transcript.prompt"),
      promptConsequential: t("homesend.transcript.promptConsequential"),
      heard: t("homesend.transcript.heard"),
      confirm: t("homesend.transcript.confirm"),
    },
    confirm: {
      this: t("homesend.confirm.this"),
      byHand: t("homesend.confirm.byHand"),
      foundThings: counted(t, "homesend.confirm.foundThings", keep("list"), language),
      looksUpdate: t("homesend.confirm.looksUpdate"),
      looksCancellation: t("homesend.confirm.looksCancellation"),
      looksConflict: t("homesend.confirm.looksConflict"),
      looksDuplicate: t("homesend.confirm.looksDuplicate"),
      thisIs: t("homesend.confirm.thisIs"),
      alsoGroceries: t("homesend.confirm.alsoGroceries"),
      updateExisting: t("homesend.confirm.updateExisting"),
      cancelExisting: t("homesend.confirm.cancelExisting"),
      keepExisting: t("homesend.confirm.keepExisting"),
      addAsNew: t("homesend.confirm.addAsNew"),
      addAnyway: t("homesend.confirm.addAnyway"),
      recordPurchases: t("homesend.confirm.recordPurchases"),
      add: t("homesend.confirm.add"),
    },
    options: {
      kind: {
        bill: t("homesend.option.kind.bill"),
        school_item: t("homesend.option.kind.schoolItem"),
        grocery_item: t("homesend.option.kind.groceryItem"),
        health_document: t("homesend.option.kind.healthDocument"),
        receipt: t("homesend.option.kind.receipt"),
      },
      bill: {
        utility: t("homesend.option.bill.utility"),
        rent: t("homesend.option.bill.rent"),
        school_fee: t("homesend.option.bill.schoolFee"),
        subscription: t("homesend.option.bill.subscription"),
        insurance: t("homesend.option.bill.insurance"),
        loan: t("homesend.option.bill.loan"),
        tax: t("homesend.option.bill.tax"),
        service: t("homesend.option.bill.service"),
        other: t("homesend.option.other"),
      },
      school: {
        homework: t("homesend.option.school.homework"),
        worksheet: t("homesend.option.school.worksheet"),
        exam: t("homesend.option.school.exam"),
        project: t("homesend.option.school.project"),
        event: t("homesend.option.school.event"),
        notice: t("homesend.option.school.notice"),
      },
      record: {
        lab_result: t("homesend.option.record.labResult"),
        prescription: t("homesend.option.record.prescription"),
        imaging_report: t("homesend.option.record.imagingReport"),
        vaccination_certificate: t("homesend.option.record.vaccinationCertificate"),
        discharge_summary: t("homesend.option.record.dischargeSummary"),
        referral: t("homesend.option.record.referral"),
        insurance_document: t("homesend.option.record.insuranceDocument"),
        visit_summary: t("homesend.option.record.visitSummary"),
        other: t("homesend.option.other"),
      },
    },
    child: {
      for: t("homesend.child.for"),
      noChildren: t("homesend.child.noChildren"),
      choose: t("homesend.child.choose"),
      addNamed: t("homesend.child.addNamed", keep("name")),
      add: t("homesend.child.add"),
      notOnRecord: t("homesend.child.notOnRecord", keep("name")),
      adminCanAdd: t("homesend.child.adminCanAdd"),
      name: t("homesend.child.name"),
      dob: t("homesend.child.dob"),
      joins: t("homesend.child.joins"),
    },
    field: {
      whatIsIt: t("homesend.field.whatIsIt"),
      billKind: t("homesend.field.billKind"),
      payee: t("homesend.field.payee"),
      amount: t("homesend.field.amount"),
      currency: t("homesend.field.currency"),
      due: t("homesend.field.due"),
      schoolKind: t("homesend.field.schoolKind"),
      subject: t("homesend.field.subject"),
      starts: t("homesend.field.starts"),
      startsHint: t("homesend.field.startsHint"),
      ends: t("homesend.field.ends"),
      whose: t("homesend.field.whose"),
      me: t("homesend.field.me"),
      readName: t("homesend.field.readName", keep("name")),
      whoseHint: t("homesend.field.whoseHint"),
      recordType: t("homesend.field.recordType"),
      documentDate: t("homesend.field.documentDate"),
      quantity: t("homesend.field.quantity"),
      unit: t("homesend.field.unit"),
      unitPlaceholder: t("homesend.field.unitPlaceholder"),
      category: t("homesend.field.category"),
      categoryPlaceholder: t("homesend.field.categoryPlaceholder"),
      notes: t("homesend.field.notes"),
    },
    receipt: {
      shop: t("homesend.receipt.shop"),
      boughtOn: t("homesend.receipt.boughtOn"),
      currency: t("homesend.receipt.currency"),
      currencyPlaceholder: t("homesend.receipt.currencyPlaceholder"),
      total: t("homesend.receipt.total", keep("total")),
      whatBought: t("homesend.receipt.whatBought"),
      explain: t("homesend.receipt.explain"),
      checking: t("homesend.receipt.checking"),
      addLine: t("homesend.receipt.addLine"),
      line: t("homesend.receipt.line", keep("number")),
      remove: t("homesend.receipt.remove", keep("name")),
      removeLine: t("homesend.receipt.removeLine", keep("number")),
      howMany: t("homesend.receipt.howMany"),
      countedIn: t("homesend.receipt.countedIn"),
      noUnit: t("homesend.receipt.noUnit"),
      unitPlaceholder: t("homesend.receipt.unitPlaceholder"),
      lineTotal: t("homesend.receipt.lineTotal"),
      thisIs: t("homesend.receipt.thisIs"),
      tracked: t("homesend.receipt.tracked", keep("name")),
      new: t("homesend.receipt.new"),
      skip: t("homesend.receipt.skip"),
      skipped: t("homesend.receipt.skipped"),
      addsTo: t("homesend.receipt.addsTo", keep("name")),
      startsTracking: t("homesend.receipt.startsTracking", keep("name")),
      thisItem: t("homesend.receipt.thisItem"),
      addNew: t("common.addNew"),
      chooseExisting: t("common.chooseExisting"),
    },
    plan: {
      found: counted(t, "homesend.plan.found", {}, language),
      lede: t("homesend.plan.lede"),
      pageUnreadable: t("homesend.plan.pageUnreadable"),
      allPagesRead: t("homesend.plan.allPagesRead", keep("total")),
      somePagesRead: t("homesend.plan.somePagesRead", keep("read", "total", "which")),
      page: t("homesend.plan.page", keep("page")),
      pages: t("homesend.plan.pages", keep("pages")),
      group: {
        updates: t("homesend.plan.group.updates"),
        new: t("homesend.plan.group.new"),
        already_on_record: t("homesend.plan.group.alreadyOnRecord"),
        conflicts: t("homesend.plan.group.conflicts"),
        needs_answer: t("homesend.plan.group.needsAnswer"),
      },
      outcome: {
        create: t("homesend.plan.outcome.create"),
        update: t("homesend.plan.outcome.update"),
        cancel: t("homesend.plan.outcome.cancel"),
        no_change: t("homesend.plan.outcome.noChange"),
        conflict: t("homesend.plan.outcome.conflict"),
        needs_answer: t("homesend.plan.outcome.needsAnswer"),
      },
      leftOut: t("homesend.plan.leftOut"),
      included: t("homesend.plan.included"),
      include: t("homesend.plan.include", keep("title")),
      sourcePage: t("homesend.plan.sourcePage", keep("page")),
      source: t("homesend.plan.source"),
      sourceWhere: t("homesend.plan.sourceWhere", keep("where")),
      changesTo: t("homesend.plan.changesTo"),
      fromHousehold: t("homesend.plan.fromHousehold"),
      onRecord: t("homesend.plan.onRecord", keep("title")),
      notSure: t("homesend.plan.notSure"),
      edit: t("homesend.plan.edit"),
      doneEditing: t("homesend.plan.doneEditing"),
      name: t("homesend.plan.name"),
      due: t("homesend.plan.due"),
      date: t("homesend.plan.date"),
      amount: t("homesend.plan.amount"),
      applying: t("homesend.plan.applying"),
      apply: t("homesend.plan.apply", keep("count")),
      nothingToChange: t("homesend.plan.nothingToChange"),
      field: {
        title: t("homesend.plan.field.title"),
        date: t("homesend.plan.date"),
        time: t("homesend.plan.field.time"),
        person: t("homesend.plan.field.for"),
        school: t("homesend.plan.field.school"),
        grade: t("homesend.plan.field.grade"),
        location: t("homesend.plan.field.location"),
        amount: t("homesend.plan.amount"),
        payee: t("homesend.plan.field.payee"),
        quantity: t("homesend.plan.field.quantity"),
        subject: t("homesend.plan.field.subject"),
        notes: t("homesend.plan.field.notes"),
      },
      fieldChild: t("homesend.plan.field.child"),
      fieldDueDate: t("homesend.plan.field.dueDate"),
    },
    applied: {
      action: {
        updated: t("homesend.applied.updated"),
        cancelled: t("homesend.applied.cancelled"),
        created: t("homesend.applied.created"),
        unchanged: t("homesend.applied.unchanged"),
        skipped: t("homesend.applied.skipped"),
        needs_clarification: t("homesend.applied.needsClarification"),
        failed: t("homesend.applied.failed"),
      },
      allDone: t("homesend.applied.allDone"),
      nothingNew: t("homesend.applied.nothingNew"),
      nothingApplied: t("homesend.applied.nothingApplied"),
      partialHeadline: t("homesend.applied.partialHeadline", keep("applied", "failed")),
      waiting: t("homesend.applied.waiting"),
      changes: counted(t, "homesend.applied.changes", {}, language),
      withWaiting: t("homesend.applied.withWaiting", keep("applied", "waiting")),
      noChange: t("homesend.applied.noChange"),
      completed: counted(t, "homesend.applied.completed", {}, language),
      partial: t("homesend.applied.partial"),
      needsReview: t("homesend.applied.needsReview"),
      none: t("homesend.applied.none"),
      undo: counted(t, "homesend.applied.undo", {}, language),
      done: t("homesend.applied.done"),
    },
  };
}

export function homesendPageLabels(t: Translate, language: string): HomeSendPageLabels {
  return {
    review: homesendReviewLabels(t, language),
    inbox: {
      dropTitle: t("homesend.drop.title"),
      dropHint: t("homesend.drop.hint"),
      chooseFile: t("homesend.drop.chooseFile"),
      paste: t("homesend.drop.paste"),
      keptBelow: t("homesend.drop.keptBelow"),
      pasteLabel: t("homesend.drop.pasteLabel"),
      pastePlaceholder: t("homesend.drop.pastePlaceholder"),
      undo: t("homesend.undo"),
      kind: {
        bill: t("homesend.kind.bill"),
        school_item: t("homesend.kind.school"),
        grocery_item: t("homesend.kind.grocery"),
        health_document: t("homesend.kind.health"),
        receipt: t("homesend.kind.receipt"),
        unknown: t("homesend.kind.unknown"),
      },
      voiceNote: t("homesend.kind.voiceNote"),
      needsReview: t("homesend.inbox.needsReview"),
      failedSafely: t("homesend.inbox.failedSafely"),
      recentlyHandled: t("homesend.inbox.recentlyHandled"),
      checkHeard: t("homesend.inbox.checkHeard"),
      review: t("homesend.inbox.review"),
      reviewAria: t("homesend.inbox.reviewAria", keep("title")),
      fillByHand: t("homesend.inbox.fillByHand"),
      fillByHandAria: t("homesend.inbox.fillByHandAria", keep("title")),
      dismiss: t("common.dismiss"),
      dismissAria: t("homesend.inbox.dismissAria", keep("title")),
      couldNotRead: t("homesend.inbox.couldNotRead"),
      failure: {
        security_rejected: t("homesend.failure.securityRejected"),
        unsupported_type: t("homesend.failure.unsupportedType"),
        unreadable: t("homesend.failure.unreadable"),
        too_large: t("homesend.failure.tooLarge"),
        link_blocked: t("homesend.failure.linkBlocked"),
        link_unreachable: t("homesend.failure.linkUnreachable"),
        transcription_unavailable: t("homesend.failure.transcriptionUnavailable"),
        transcription_failed: t("homesend.failure.transcriptionFailed"),
      },
      status: {
        keptExisting: t("homesend.status.keptExisting"),
        dismissed: t("homesend.status.dismissed"),
        undone: t("homesend.status.undone"),
        recorded: t("homesend.status.recorded"),
        updated: t("homesend.status.updated"),
        cancelled: t("homesend.status.cancelled"),
        added: t("homesend.status.added"),
      },
      updatedOnRecord: t("homesend.history.updatedOnRecord"),
      cancelledOnRecord: t("homesend.history.cancelledOnRecord"),
      addedOnItsOwn: t("homesend.history.addedOnItsOwn"),
      planned: t("homesend.history.planned", keep("action", "title", "reason")),
      bought: t("homesend.history.bought", keep("name")),
      boughtLine: t("homesend.history.boughtLine"),
      tracking: t("homesend.history.tracking", keep("name")),
      trackingNew: t("homesend.history.trackingNew"),
      alsoGroceries: t("homesend.history.alsoGroceries", keep("name")),
      alsoGroceriesPlain: t("homesend.history.alsoGroceriesPlain"),
      undoAdding: t("homesend.undo.adding", keep("title")),
      undoUpdating: t("homesend.undo.updating", keep("title")),
      undoCancelling: t("homesend.undo.cancelling", keep("title")),
      undoRecording: t("homesend.undo.recording", keep("title")),
      undoRecordingLine: t("homesend.undo.recordingLine"),
      undoAddingGrocery: t("homesend.undo.addingGrocery"),
      undoUpdatingGrocery: t("homesend.undo.updatingGrocery"),
      emptyChannelTitle: t("homesend.empty.channelTitle", keep("channel")),
      emptyChannelDescription: t("homesend.empty.channelDescription"),
      emptyTitle: t("homesend.empty.title"),
      emptyDescription: t("homesend.empty.description"),
    },
    channels: {
      title: t("homesend.channels.title"),
      whatsappTitle: t("homesend.channels.whatsappTitle"),
      whatsappConnected: t("homesend.channels.whatsappConnected", keep("number")),
      whatsappConnect: t("homesend.channels.whatsappConnect"),
      emailTitle: t("homesend.channels.emailTitle"),
      emailActive: t("homesend.channels.emailActive"),
      emailRevoked: t("homesend.channels.emailRevoked"),
      emailAdmin: t("homesend.channels.emailAdmin"),
      emailAskAdmin: t("homesend.channels.emailAskAdmin"),
      copyAria: t("homesend.channels.copyAria"),
      copy: t("homesend.channels.copy"),
      copied: t("homesend.channels.copied"),
      working: t("homesend.channels.working"),
      turnBackOn: t("homesend.channels.turnBackOn"),
      setUp: t("homesend.channels.setUp"),
      rotating: t("homesend.channels.rotating"),
      newAddress: t("homesend.channels.newAddress"),
      turningOff: t("homesend.channels.turningOff"),
      turnOff: t("homesend.channels.turnOff"),
      installTitle: t("homesend.channels.installTitle"),
      installBody: t("homesend.channels.installBody"),
      install: t("homesend.channels.install"),
      installDescription: t("homesend.channels.installDescription"),
      gotIt: t("homesend.channels.gotIt"),
      installSteps: {
        ios: [t("homesend.install.ios1"), t("homesend.install.ios2"), t("homesend.install.ios3")],
        android: [t("homesend.install.android1"), t("homesend.install.android2"), t("homesend.install.android3")],
        desktop: [t("homesend.install.desktop1"), t("homesend.install.desktop2")],
        unknown: [t("homesend.install.other")],
      },
    },
  };
}
