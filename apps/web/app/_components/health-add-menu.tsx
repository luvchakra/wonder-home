"use client";

import { Activity, CalendarCheck, CalendarClock, FileText, Gauge, HeartPulse, Repeat, Target } from "lucide-react";
import { useState } from "react";

import { AddMenu, type AddMenuGroup } from "@wonderhome/core/ui/add-menu";

import { BookAppointmentButton } from "./health-appointment-forms";
import { AddCheckupButton } from "./health-checkup-forms";
import { AddFitnessGoalButton, LogFitnessSessionButton } from "./health-fitness-forms";
import type { HealthFormLabels } from "../_lib/health-form-labels";
import { AddIssueButton } from "./health-issue-forms";
import { AddRoutineButton } from "./health-measurement-routine-forms";
import { AddRecordButton } from "./health-record-forms";
import { AddVitalButton } from "./health-vital-forms";

type Kind = "issue" | "vital" | "routine" | "record" | "appointment" | "checkup" | "session" | "goal";

export type HealthAddMenuWords = {
  label: string;
  title: string;
  description: string;
  groups: { health: string; visits: string; fitness: string };
  meta: Record<Kind, string>;
};

/**
 * Health & Fitness's one "Add" (the owner, 2026-10-21: "too many entry
 * options"). The eight kinds of thing a household records here used to be
 * eight pills; they are one pill now, opening a sheet grouped by what the
 * person is deciding — something about health, a doctor's visit, or fitness.
 * Picking a kind opens that kind's own form, exactly as its pill did.
 */
export function HealthAddMenu({
  householdId,
  members,
  defaultPrivacyScope,
  goals,
  labels,
  words,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  goals: { id: string; label: string }[];
  labels: HealthFormLabels;
  words: HealthAddMenuWords;
}) {
  // Each pick remounts its form open (`defaultOpen`), so picking the same kind twice opens it twice.
  const [picked, setPicked] = useState<{ kind: Kind; nonce: number } | null>(null);
  if (members.length === 0) return null;

  const groups: AddMenuGroup[] = [
    {
      title: words.groups.health,
      items: [
        { key: "issue", icon: HeartPulse, tone: "health", title: labels.issue.add, meta: words.meta.issue },
        { key: "vital", icon: Gauge, tone: "health", title: labels.vital.add, meta: words.meta.vital },
        { key: "routine", icon: Repeat, tone: "health", title: labels.routine.add, meta: words.meta.routine },
        { key: "record", icon: FileText, tone: "health", title: labels.healthRecord.add, meta: words.meta.record },
      ],
    },
    {
      title: words.groups.visits,
      items: [
        { key: "appointment", icon: CalendarClock, tone: "primary", title: labels.appointment.add, meta: words.meta.appointment },
        { key: "checkup", icon: CalendarCheck, tone: "primary", title: labels.checkup.add, meta: words.meta.checkup },
      ],
    },
    {
      title: words.groups.fitness,
      items: [
        { key: "session", icon: Activity, tone: "handled", title: labels.session.add, meta: words.meta.session },
        { key: "goal", icon: Target, tone: "handled", title: labels.goal.add, meta: words.meta.goal },
      ],
    },
  ];

  const common = { householdId, members, defaultPrivacyScope, labels, defaultOpen: true, hideTrigger: true } as const;
  const key = picked ? `${picked.kind}-${picked.nonce}` : "";
  return (
    <>
      <AddMenu
        label={words.label}
        title={words.title}
        description={words.description}
        groups={groups}
        onPick={(kind) => setPicked((previous) => ({ kind: kind as Kind, nonce: (previous?.nonce ?? 0) + 1 }))}
      />
      {picked?.kind === "issue" ? <AddIssueButton key={key} {...common} /> : null}
      {picked?.kind === "vital" ? <AddVitalButton key={key} {...common} /> : null}
      {picked?.kind === "routine" ? <AddRoutineButton key={key} {...common} /> : null}
      {picked?.kind === "record" ? <AddRecordButton key={key} {...common} /> : null}
      {picked?.kind === "appointment" ? <BookAppointmentButton key={key} {...common} /> : null}
      {picked?.kind === "checkup" ? <AddCheckupButton key={key} {...common} /> : null}
      {picked?.kind === "session" ? <LogFitnessSessionButton key={key} {...common} goals={goals} /> : null}
      {picked?.kind === "goal" ? <AddFitnessGoalButton key={key} {...common} /> : null}
    </>
  );
}
