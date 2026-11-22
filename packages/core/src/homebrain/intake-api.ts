/**
 * HomeBrain's interface to HomeSend (owner, 2026-11-22: "HomeBrain is
 * supposed to have the intelligence related algorithms, homesend is supposed
 * to have the data transfer related features").
 *
 * HomeSend moves things in and out — channels, storage, scanning, the retry
 * queue, replies and the governed writes. Everything that understands,
 * decides, matches, learns, scores or judges what arrives lives in HomeBrain
 * (`homebrain/intake/`, `homebrain/learning/`, `homebrain/school/`), and
 * HomeSend reaches it only through this file. In short:
 *
 *   - read and understand an item: the readers (`defaultClassify`,
 *     `strongerClassify`, `defaultTranscribe`), `buildUnderstanding`,
 *     `detectInstructionInjection`, `suspectedScam`, `readPaymentProof`;
 *   - decide what it becomes: `decisionFromModel` / `decisionFromReading`,
 *     then `validateDecision` before anything is written; learned rules
 *     (`learnedRuleFor`, `applyLearnedRule`) and similar past decisions;
 *   - match it against what is on file: `matchOnRecord`, `reconcileHomeSend`,
 *     `matchPaymentToBill`, `matchExam`, `planTimetable`, `planSyllabus`;
 *   - judge what to keep: the tidy rules and the tidy judge;
 *   - learn from what people did: `rememberDecision`, `recordDecisionOutcome`.
 *
 * `homebrain/intake-boundary.test.ts` fails if a HomeSend file imports a
 * model client, embeddings or any HomeBrain module except through here, or
 * if HomeBrain imports a HomeSend channel. Behaviour is unchanged by the
 * move: these are the same functions HomeSend called before.
 */

export type { DocumentRecord, EvidenceRef, PageReport } from "./intake/document";
export { usualBill } from "./history-fill";
export { childrenOfSchoolItems, listPayeeBills, readKnownCorrespondents } from "./household-records";
export { healthSubjectFor } from "./intake/health-filers";
export { vendorKey } from "./rules";
export { billRecords, canAdd, receiptLines } from "./intake/can-add";
export type { DocumentPlan, PlanEntry, PlanFieldChange } from "./intake/plan";
export { examplesText, recordDecisionOutcome, rememberDecision, similarDecisions } from "./learning/decision-memory";
export { notHouseholdInformation } from "./intake/household-information";
export type { DirectAdd } from "./intake/auto-add";
export { applyLearnedRule, learnedRuleFor, learnedRuleLine } from "./learning/decision-rules";
export { listHouseholdRules } from "./rules-repository";
export { suspectedScam } from "./scam";
export { senderKey } from "./learning/learned";
export { withoutNames } from "./sleep/embeddings";
export type { Embedder } from "./sleep/embeddings";
export { datedOperations, decisionFromModel, decisionFromReading, newKindSentence, validateDecision } from "./intake/decision";
export type { ValidatedDecision } from "./intake/decision";
export { examKey, matchExam, openExams, paperFor } from "./school/exam-match";
export type { ExamEvidence } from "./school/exam-match";
export { fillFromEvidence, missingRequired } from "./intake/completeness";
export type { CompletenessReading } from "./intake/completeness";
export { recoverWhen } from "./intake/when";
export { dayFromDateText } from "../ai/classify-intake";
export { gateTranscript, recordsWhatWasHeard, uncertainTranscriptPrompt } from "./intake/audio";
export { detectInstructionInjection } from "./intake/injection";
export type { InjectionScan } from "./intake/injection";
export { matchPaymentToBill, paymentTitle, readPaymentProof } from "./intake/payment-proof";
export type { OpenBill, PaymentProof } from "./intake/payment-proof";
export { buildUnderstanding, unreadableUnderstanding } from "./intake/understanding";
export type { IntakeUnderstanding, UnderstandingMeta } from "./intake/understanding";
export { defaultClassify, defaultTranscribe, logTranscriptionFailure, strongerClassify } from "./intake/readers";
export type { ClassifyResult, TranscribeResult } from "./intake/readers";
export { reconcileHomeSend } from "./intake/reconcile";
export type { HomeSendCandidate, HomeSendReconciliation, ReconcilableDomain } from "./intake/reconcile";
export { canRecordBill, matchOnRecord } from "./intake/bill-match";
export { readsAboveTheBar } from "./intake/above-bar";
export type { SenderHistory } from "./memory-resolve";
export { notesWithExtras, planSyllabus } from "./school/syllabus";
export { AI_ITEMS_PER_RUN, MONEY_OR_HEALTH, checkVerdict, decideByRules, isPastWithGrace, itemDays, newerFromSameSender, tidyFacts } from "./intake/tidy";
export type { TidiedEntry, TidyDecision, TidyItem } from "./intake/tidy";
export type { TidyJudge, TidyQuestion } from "./intake/tidy-model";
export { judgeForHousehold } from "./intake/tidy-judge";
export { classOf, planTimetable } from "./school/timetable";
export type { TimetableChild, TimetablePaper, TimetablePlan } from "./school/timetable";
export type { ConfirmationDecision } from "./intake/confirmation";
export { FROM_A_FILE } from "./intake/verify";
