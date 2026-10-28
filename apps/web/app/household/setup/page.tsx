import { redirect } from "next/navigation";

/**
 * The setup walk-through is retired (design/UI-SIMPLIFICATION-v1.md M5):
 * `/onboarding` is the one guided setup, and after it each step's own page is
 * its editor. Old links, with their step, land on that editor.
 */
const STEP_HOMES: Record<string, string> = {
  family: "/family#add",
  responsibilities: "/household/responsibilities",
  playbook: "/settings?tab=household#playbook",
  policies: "/settings?tab=household#policies",
  connections: "/settings/connections",
  teach: "/settings?tab=household#teach",
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  redirect((step && STEP_HOMES[step]) || "/settings?tab=household");
}
