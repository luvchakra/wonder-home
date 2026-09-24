import { redirect } from "next/navigation";

import {
  clampComposition,
  guidedQuestions,
  ONBOARDING_STEPS,
  previousStep,
  questionToken,
  SUGGESTION_CATEGORIES,
  type OnboardingStep,
  type SuggestionCategory,
} from "@wonderhome/core/household/onboarding";
import { loadOnboarding, loadOnboardingSnapshot, type OnboardingState } from "@wonderhome/core/household/onboarding-repository";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";

import { requireSession } from "../_lib/session";
import { AdultsScreen, BasicsScreen, ChildrenScreen, OverviewScreen, PetsAndHelpScreen, WelcomeScreen } from "./screens-people";
import { DoneScreen, GuidedScreen, ReviewScreen, SuggestionsScreen, SummaryScreen } from "./screens-plan";

export const metadata = { title: "Set up your home" };
export const dynamic = "force-dynamic";

/** Where a household that has never started setup begins. Nothing is written until they press something. */
const NOT_STARTED: OnboardingState = {
  status: "in_progress",
  step: "welcome",
  composition: clampComposition({}),
  dismissed: [],
  startedAt: new Date(0).toISOString(),
  completedAt: null,
};

/**
 * Intelligent household onboarding (story 02-009): twelve screens over one
 * route. `?step=` picks the screen; without it, setup opens where the
 * household left off. Every screen is rendered from the household's real
 * records at that moment, so going back shows what was saved, not a draft
 * kept in the browser.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; category?: string; skip?: string }>;
}) {
  const [params, session] = await Promise.all([searchParams, requireSession("/onboarding")]);
  const { supabase, membership } = session;
  // Setup changes who is in the household and who owns what: an Admin's job.
  if (!isHouseholdAdmin(membership)) redirect("/");

  const state = (await loadOnboarding(supabase, membership.household.id)) ?? NOT_STARTED;
  const requested = (ONBOARDING_STEPS as readonly string[]).includes(params.step ?? "") ? (params.step as OnboardingStep) : null;
  const step: OnboardingStep = requested ?? state.step;
  const snapshot = await loadOnboardingSnapshot(supabase, membership.household, state);
  const composition = snapshot.state.composition;
  const firstName = membership.displayName.split(/\s+/)[0] ?? membership.displayName;

  switch (step) {
    case "welcome":
      return <WelcomeScreen firstName={firstName} />;
    case "basics":
      return <BasicsScreen snapshot={snapshot} />;
    case "overview":
      return <OverviewScreen snapshot={snapshot} />;
    case "adults":
      return <AdultsScreen snapshot={snapshot} selfId={membership.memberId} backTo={previousStep("adults", composition)} />;
    case "children":
      return <ChildrenScreen snapshot={snapshot} />;
    case "pets":
      return <PetsAndHelpScreen snapshot={snapshot} backTo={previousStep("pets", composition)} />;
    case "suggestions":
      return <SuggestionsScreen snapshot={snapshot} />;
    case "review": {
      const category = (SUGGESTION_CATEGORIES as readonly string[]).includes(params.category ?? "")
        ? (params.category as SuggestionCategory)
        : (snapshot.facts.pending[0]?.category ?? "home");
      return <ReviewScreen snapshot={snapshot} category={category} />;
    }
    case "summary":
      return <SummaryScreen snapshot={snapshot} hasQuestions={guidedQuestions(snapshot.facts).length > 0} />;
    case "guided": {
      // Set aside for this visit only: "Maybe later" never becomes "never".
      const skipped = (params.skip ?? "").split(",").filter((token) => /^[a-z_]{1,40}$/.test(token));
      const question = guidedQuestions(snapshot.facts, skipped)[0] ?? null;
      return <GuidedScreen snapshot={snapshot} question={question} skipped={skipped} skipToken={question ? questionToken(question) : null} />;
    }
    case "done":
      return <DoneScreen snapshot={snapshot} />;
  }
}
