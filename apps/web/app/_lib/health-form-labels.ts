import type { AppointmentType } from "@wonderhome/core/health/appointments";
import type { CheckupType } from "@wonderhome/core/health/checkups";
import type { FitnessActivityType, FitnessFrequencyPeriod } from "@wonderhome/core/health/fitness";
import type { RecordType } from "@wonderhome/core/health/records";
import type { PrivacyScope } from "@wonderhome/core/health/repository";
import type { VitalType } from "@wonderhome/core/health/vitals";
import type { Translate } from "@wonderhome/core/i18n/translate";

/**
 * Every Health & Fitness sheet's words in the viewer's language, built on the
 * server (story 22-004) and handed to the client forms as one `labels` prop.
 *
 * A `{name}`, `{current}`, `{total}` or `{label}` stays a placeholder here and
 * is filled in by the sheet with the household's own words — a person's name,
 * a routine's label — which are never translated. Stored values (a scope, a
 * type, a status) never change: only what is shown for them does.
 */
export type HealthFormLabels = {
  scopes: Record<PrivacyScope, string>;
  careTypes: Record<AppointmentType | CheckupType, string>;
  vitalTypes: Record<VitalType, string>;
  activityTypes: Record<FitnessActivityType, string>;
  recordTypes: Record<RecordType, string>;
  periods: Record<FitnessFrequencyPeriod, string>;
  issueStatusActions: Record<"startTracking" | "resolved" | "monitor" | "activeAgain" | "reopen", string>;
  common: {
    whoFor: string;
    whoCanSee: string;
    notes: string;
    notesPlaceholder: string;
    notesPlaceholderElse: string;
    edit: string;
    editNamed: string;
    remove: string;
    bringBack: string;
    markDone: string;
    record: string;
    recording: string;
    save: string;
    saving: string;
    adding: string;
    back: string;
    next: string;
    whatCalled: string;
    preferredTime: string;
    nextDue: string;
    repeats: string;
    whenDefaultNow: string;
    measurement: string;
    measurementPlaceholder: string;
    unit: string;
    unitPlaceholder: string;
    value: string;
    systolic: string;
    diastolic: string;
    activity: string;
    householdCommitment: string;
    correctDescription: string;
  };
  privacy: {
    label: string;
    hints: Record<PrivacyScope, string>;
    aiTitle: string;
    aiBody: string;
    aiSwitch: string;
    shareAdd: string;
    shareTitle: string;
    shareDescription: string;
    shareWith: string;
    shareChoose: string;
    shareSubmit: string;
    shareSharing: string;
    revokeLabel: string;
    revokeTitle: string;
    revokeDescription: string;
    revokeConfirm: string;
  };
  appointment: {
    add: string;
    step: string;
    steps: [string, string, string, string, string, string];
    kind: string;
    starts: string;
    startsMissing: string;
    ends: string;
    endsHint: string;
    provider: string;
    providerPlaceholder: string;
    facility: string;
    facilityPlaceholder: string;
    location: string;
    locationPlaceholder: string;
    prepare: string;
    preparePlaceholder: string;
    remindAdvance: string;
    remindPreparation: string;
    remindDayOf: string;
    calendarSync: string;
    calendarSyncHint: string;
    submit: string;
    booking: string;
    confirm: string;
    confirmLabel: string;
    complete: string;
    completeLabel: string;
    cancel: string;
    cancelLabel: string;
  };
  checkup: {
    add: string;
    whatsDue: string;
    whatsDuePlaceholder: string;
    type: string;
    cadence: Record<"" | "90" | "180" | "365" | "730", string>;
    submit: string;
    editTitle: string;
    editDescription: string;
    book: string;
    bookLabel: string;
  };
  issue: {
    add: string;
    title: string;
    description: string;
    whatsGoingOn: string;
    whatsGoingOnPlaceholder: string;
    detail: string;
    detailPlaceholder: string;
    since: string;
    editTitle: string;
    editDescription: string;
  };
  goal: {
    add: string;
    title: string;
    description: string;
    customPlaceholder: string;
    howMany: string;
    per: string;
    submit: string;
    editTitle: string;
    editDescription: string;
  };
  session: {
    add: string;
    description: string;
    countsToward: string;
    noGoal: string;
    duration: string;
    distance: string;
    distanceUnitRequired: string;
    distanceUnitPlaceholder: string;
    distanceUnit: string;
    submit: string;
    logging: string;
    editTitle: string;
  };
  routine: {
    add: string;
    title: string;
    cadence: Record<"1" | "7" | "14" | "30", string>;
    firstDue: string;
    remind: string;
    submit: string;
    editTitle: string;
    editDescription: string;
    markNamed: string;
    recordTitle: string;
    /** English reads "Record blood pressure"; other languages keep the label as the household wrote it. */
    lowercaseName: boolean;
    recordDescription: string;
  };
  healthRecord: {
    add: string;
    title: string;
    description: string;
    whose: string;
    what: string;
    whatPlaceholder: string;
    kind: string;
    date: string;
    submit: string;
    filing: string;
    editTitle: string;
    editDescription: string;
  };
  vital: {
    add: string;
    description: string;
    editTitle: string;
  };
};

/** Fills a placeholder the server kept for the client (`{name}` → the household's own words). */
export const KEEP_NAME = { name: "{name}" };

/** Every Health & Fitness sheet's words in the viewer's language (story 22-004). */
export function healthFormLabels(t: Translate, language: string): HealthFormLabels {
  return {
    scopes: {
      private: t("healthForm.scope.private"),
      selected_family: t("healthForm.scope.selected_family"),
      household_operational: t("healthForm.scope.household_operational"),
    },
    careTypes: {
      doctor: t("healthForm.careType.doctor"),
      dentist: t("healthForm.careType.dentist"),
      eye_care: t("healthForm.careType.eye_care"),
      physiotherapy: t("healthForm.careType.physiotherapy"),
      dermatology: t("healthForm.careType.dermatology"),
      specialist: t("healthForm.careType.specialist"),
      diagnostic: t("healthForm.careType.diagnostic"),
      vaccination: t("healthForm.careType.vaccination"),
      mental_wellness: t("healthForm.careType.mental_wellness"),
      screening: t("healthForm.careType.screening"),
      other: t("healthForm.careType.other"),
    },
    vitalTypes: {
      weight: t("healthForm.vitalType.weight"),
      height: t("healthForm.vitalType.height"),
      temperature: t("healthForm.vitalType.temperature"),
      blood_pressure: t("healthForm.vitalType.blood_pressure"),
      pulse: t("healthForm.vitalType.pulse"),
      steps: t("healthForm.vitalType.steps"),
      distance: t("healthForm.vitalType.distance"),
      exercise_duration: t("healthForm.vitalType.exercise_duration"),
      resting_heart_rate: t("healthForm.vitalType.resting_heart_rate"),
      custom: t("healthForm.vitalType.custom"),
    },
    activityTypes: {
      walk: t("healthForm.activityType.walk"),
      run: t("healthForm.activityType.run"),
      cycle: t("healthForm.activityType.cycle"),
      swim: t("healthForm.activityType.swim"),
      yoga: t("healthForm.activityType.yoga"),
      strength_training: t("healthForm.activityType.strength_training"),
      sports: t("healthForm.activityType.sports"),
      stretching: t("healthForm.activityType.stretching"),
      other: t("healthForm.activityType.other"),
    },
    recordTypes: {
      lab_result: t("healthForm.recordType.lab_result"),
      prescription: t("healthForm.recordType.prescription"),
      imaging_report: t("healthForm.recordType.imaging_report"),
      vaccination_certificate: t("healthForm.recordType.vaccination_certificate"),
      discharge_summary: t("healthForm.recordType.discharge_summary"),
      referral: t("healthForm.recordType.referral"),
      insurance_document: t("healthForm.recordType.insurance_document"),
      visit_summary: t("healthForm.recordType.visit_summary"),
      other: t("healthForm.recordType.other"),
    },
    periods: {
      day: t("healthForm.goal.period.day"),
      week: t("healthForm.goal.period.week"),
      month: t("healthForm.goal.period.month"),
    },
    issueStatusActions: {
      startTracking: t("healthForm.issue.startTracking"),
      resolved: t("healthForm.issue.resolved"),
      monitor: t("healthForm.issue.monitor"),
      activeAgain: t("healthForm.issue.activeAgain"),
      reopen: t("healthForm.issue.reopen"),
    },
    common: {
      whoFor: t("healthForm.whoFor"),
      whoCanSee: t("healthForm.whoCanSee"),
      notes: t("healthForm.notes"),
      notesPlaceholder: t("healthForm.notesPlaceholder"),
      notesPlaceholderElse: t("healthForm.notesPlaceholderElse"),
      edit: t("healthForm.edit"),
      editNamed: t("healthForm.editNamed", KEEP_NAME),
      remove: t("healthForm.remove"),
      bringBack: t("healthForm.bringBack"),
      markDone: t("healthForm.markDone"),
      record: t("healthForm.record"),
      recording: t("healthForm.recording"),
      save: t("common.save"),
      saving: t("common.saving"),
      adding: t("common.adding"),
      back: t("common.back"),
      next: t("common.next"),
      whatCalled: t("healthForm.whatCalled"),
      preferredTime: t("healthForm.preferredTime"),
      nextDue: t("healthForm.nextDue"),
      repeats: t("healthForm.repeats"),
      whenDefaultNow: t("healthForm.whenDefaultNow"),
      measurement: t("healthForm.measurement"),
      measurementPlaceholder: t("healthForm.measurementPlaceholder"),
      unit: t("healthForm.unit"),
      unitPlaceholder: t("healthForm.unitPlaceholder"),
      value: t("healthForm.value"),
      systolic: t("healthForm.systolic"),
      diastolic: t("healthForm.diastolic"),
      activity: t("healthForm.activity"),
      householdCommitment: t("healthForm.householdCommitment"),
      correctDescription: t("healthForm.correctDescription"),
    },
    privacy: {
      label: t("healthForm.privacy.label"),
      hints: {
        private: t("healthForm.privacy.hint.private"),
        selected_family: t("healthForm.privacy.hint.selected_family"),
        household_operational: t("healthForm.privacy.hint.household_operational"),
      },
      aiTitle: t("healthForm.ai.title"),
      aiBody: t("healthForm.ai.body"),
      aiSwitch: t("healthForm.ai.switch"),
      shareAdd: t("healthForm.share.add"),
      shareTitle: t("healthForm.share.title"),
      shareDescription: t("healthForm.share.description"),
      shareWith: t("healthForm.share.with"),
      shareChoose: t("healthForm.share.choose"),
      shareSubmit: t("healthForm.share.submit"),
      shareSharing: t("healthForm.share.sharing"),
      revokeLabel: t("healthForm.revoke.label", KEEP_NAME),
      revokeTitle: t("healthForm.revoke.title", KEEP_NAME),
      revokeDescription: t("healthForm.revoke.description", KEEP_NAME),
      revokeConfirm: t("healthForm.revoke.confirm"),
    },
    appointment: {
      add: t("healthForm.appointment.add"),
      step: t("healthForm.appointment.step", { current: "{current}", total: "{total}", label: "{label}" }),
      steps: [
        t("healthForm.appointment.step.who"),
        t("healthForm.appointment.step.what"),
        t("healthForm.appointment.step.when"),
        t("healthForm.appointment.step.where"),
        t("healthForm.appointment.step.notes"),
        t("healthForm.appointment.step.reminders"),
      ],
      kind: t("healthForm.appointment.kind"),
      starts: t("healthForm.appointment.starts"),
      startsMissing: t("healthForm.appointment.startsMissing"),
      ends: t("healthForm.appointment.ends"),
      endsHint: t("healthForm.appointment.endsHint"),
      provider: t("healthForm.appointment.provider"),
      providerPlaceholder: t("healthForm.appointment.providerPlaceholder"),
      facility: t("healthForm.appointment.facility"),
      facilityPlaceholder: t("healthForm.appointment.facilityPlaceholder"),
      location: t("healthForm.appointment.location"),
      locationPlaceholder: t("healthForm.appointment.locationPlaceholder"),
      prepare: t("healthForm.appointment.prepare"),
      preparePlaceholder: t("healthForm.appointment.preparePlaceholder"),
      remindAdvance: t("healthForm.appointment.remindAdvance"),
      remindPreparation: t("healthForm.appointment.remindPreparation"),
      remindDayOf: t("healthForm.appointment.remindDayOf"),
      calendarSync: t("healthForm.appointment.calendarSync"),
      calendarSyncHint: t("healthForm.appointment.calendarSyncHint"),
      submit: t("healthForm.appointment.submit"),
      booking: t("healthForm.appointment.booking"),
      confirm: t("healthForm.appointment.confirm"),
      confirmLabel: t("healthForm.appointment.confirmLabel"),
      complete: t("healthForm.appointment.complete"),
      completeLabel: t("healthForm.appointment.completeLabel"),
      cancel: t("healthForm.appointment.cancel"),
      cancelLabel: t("healthForm.appointment.cancelLabel"),
    },
    checkup: {
      add: t("healthForm.checkup.add"),
      whatsDue: t("healthForm.checkup.whatsDue"),
      whatsDuePlaceholder: t("healthForm.checkup.whatsDuePlaceholder"),
      type: t("healthForm.checkup.type"),
      cadence: {
        "": t("healthForm.checkup.cadence.once"),
        "90": t("healthForm.checkup.cadence.90"),
        "180": t("healthForm.checkup.cadence.180"),
        "365": t("healthForm.checkup.cadence.365"),
        "730": t("healthForm.checkup.cadence.730"),
      },
      submit: t("healthForm.checkup.submit"),
      editTitle: t("healthForm.checkup.editTitle"),
      editDescription: t("healthForm.checkup.editDescription"),
      book: t("healthForm.checkup.book"),
      bookLabel: t("healthForm.checkup.bookLabel"),
    },
    issue: {
      add: t("healthForm.issue.add"),
      title: t("healthForm.issue.title"),
      description: t("healthForm.issue.description"),
      whatsGoingOn: t("healthForm.issue.whatsGoingOn"),
      whatsGoingOnPlaceholder: t("healthForm.issue.whatsGoingOnPlaceholder"),
      detail: t("healthForm.issue.detail"),
      detailPlaceholder: t("healthForm.issue.detailPlaceholder"),
      since: t("healthForm.issue.since"),
      editTitle: t("healthForm.issue.editTitle"),
      editDescription: t("healthForm.issue.editDescription"),
    },
    goal: {
      add: t("healthForm.goal.add"),
      title: t("healthForm.goal.title"),
      description: t("healthForm.goal.description"),
      customPlaceholder: t("healthForm.goal.customPlaceholder"),
      howMany: t("healthForm.goal.howMany"),
      per: t("healthForm.goal.per"),
      submit: t("healthForm.goal.submit"),
      editTitle: t("healthForm.goal.editTitle"),
      editDescription: t("healthForm.goal.editDescription"),
    },
    session: {
      add: t("healthForm.session.add"),
      description: t("healthForm.session.description"),
      countsToward: t("healthForm.session.countsToward"),
      noGoal: t("healthForm.session.noGoal"),
      duration: t("healthForm.session.duration"),
      distance: t("healthForm.session.distance"),
      distanceUnitRequired: t("healthForm.session.distanceUnitRequired"),
      distanceUnitPlaceholder: t("healthForm.session.distanceUnitPlaceholder"),
      distanceUnit: t("healthForm.session.distanceUnit"),
      submit: t("healthForm.session.submit"),
      logging: t("healthForm.session.logging"),
      editTitle: t("healthForm.session.editTitle"),
    },
    routine: {
      add: t("healthForm.routine.add"),
      title: t("healthForm.routine.title"),
      cadence: {
        "1": t("healthForm.routine.cadence.1"),
        "7": t("healthForm.routine.cadence.7"),
        "14": t("healthForm.routine.cadence.14"),
        "30": t("healthForm.routine.cadence.30"),
      },
      firstDue: t("healthForm.routine.firstDue"),
      remind: t("healthForm.routine.remind"),
      submit: t("healthForm.routine.submit"),
      editTitle: t("healthForm.routine.editTitle"),
      editDescription: t("healthForm.routine.editDescription"),
      markNamed: t("healthForm.routine.markNamed", KEEP_NAME),
      recordTitle: t("healthForm.routine.recordTitle", KEEP_NAME),
      lowercaseName: language === "en",
      recordDescription: t("healthForm.routine.recordDescription"),
    },
    healthRecord: {
      add: t("healthForm.healthRecord.add"),
      title: t("healthForm.healthRecord.title"),
      description: t("healthForm.healthRecord.description"),
      whose: t("healthForm.healthRecord.whose"),
      what: t("healthForm.healthRecord.what"),
      whatPlaceholder: t("healthForm.healthRecord.whatPlaceholder"),
      kind: t("healthForm.healthRecord.kind"),
      date: t("healthForm.healthRecord.date"),
      submit: t("healthForm.healthRecord.submit"),
      filing: t("healthForm.healthRecord.filing"),
      editTitle: t("healthForm.healthRecord.editTitle"),
      editDescription: t("healthForm.healthRecord.editDescription"),
    },
    vital: {
      add: t("healthForm.vital.add"),
      description: t("healthForm.vital.description"),
      editTitle: t("healthForm.vital.editTitle"),
    },
  };
}

/** `{name}` in a server-built label → the household's own words. Pure, so a client sheet can import it too. */
export function withName(template: string, name: string): string {
  return template.replace("{name}", () => name);
}
