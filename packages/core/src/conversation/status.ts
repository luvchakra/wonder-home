import type { HomeAssessment } from "../home/assessment";
import { linkTo } from "./reply-format";

/**
 * The answer to "what's going on in my home?" (product-direction update §7:
 * "What needs my attention?", "What are you handling?", "Prepare tomorrow").
 *
 * Composed deterministically from the same domain engines that feed the Home
 * screen — never from a model's impression of the household. Every sentence
 * here is arithmetic somebody can explain (design principle 9): a count of
 * things the system evaluated, and the reasons the domains themselves gave.
 * Nothing about the household leaves the server to produce it.
 */

/** A place in the app where the thing can be seen or done. */
export type Place = { label: string; href: string };

export type StatusFacts = {
  /** What currently needs a person, most urgent first, each with where to go for it. */
  needsYou: readonly (HomeAssessment & { place?: Place })[];
  /** Domains that were checked and found fine. */
  handled: readonly { title: string; meta?: string }[];
  /** Everything evaluated, across every domain this person may see. */
  checked: number;
  /** Domains that could not be read this time, by label. */
  unavailable?: readonly string[];
  /** Events in the window asked about, when the question was about a day. */
  events?: readonly { title: string; startsAt: Date; cancelled?: boolean }[];
  /** "today", "tomorrow", "this week" — when the question named a day. */
  when?: string | null;
  timezone?: string;
};

const MAX_LISTED = 4;

export function composeStatusAnswer(facts: StatusFacts): string {
  const when = facts.when?.toLowerCase() ?? null;
  const parts: string[] = [];

  if (when && facts.events) {
    parts.push(describeEvents(facts.events, when, facts.timezone));
  }

  if (facts.checked === 0 && facts.needsYou.length === 0) {
    parts.push(
      when && facts.events
        ? "Beyond that, I have not been told enough about the home to check anything yet."
        : "I have not been told enough about the home to check anything yet. Add a few things — groceries, bills, who does what — and I will start keeping track.",
    );
    return parts.join(" ");
  }

  const needs = [...facts.needsYou];
  if (needs.length === 0) {
    parts.push(
      `All quiet. I checked ${count(facts.checked, "thing")}${describeHandled(facts.handled)} and nothing needs you right now. ${linkTo("/today", "Today")} has the day's plan.`,
    );
  } else {
    const listed = needs.slice(0, MAX_LISTED).map((need) => `- **${need.title}** — ${trimReason(need.reason)}${need.place ? ` → ${linkTo(need.place.href, need.place.label)}` : ""}`);
    const rest = needs.length - listed.length;
    const urgent = needs.filter((need) => need.riskLevel === "high").length;
    parts.push(
      `**${count(needs.length, "thing")} need${needs.length === 1 ? "s" : ""} you**${urgent > 0 ? ` (${urgent} urgent)` : ""}:\n${listed.join("\n")}${rest > 0 ? `\n- and ${rest} more on ${linkTo("/", "Home")}` : ""}`,
    );
    const quiet = Math.max(0, facts.checked - needs.length);
    if (quiet > 0) {
      parts.push(`Everything else — ${count(quiet, "thing")} — is handled${describeHandled(facts.handled)}.`);
    }
  }

  if (facts.unavailable && facts.unavailable.length > 0) {
    parts.push(`I could not read ${facts.unavailable.join(" or ")} just now, so that part is missing.`);
  }

  return parts.join("\n\n");
}

function describeEvents(events: StatusFacts["events"], when: string, timezone?: string): string {
  const live = (events ?? []).filter((event) => !event.cancelled);
  const label = when === "today" || when === "tonight" ? "Today" : when === "tomorrow" ? "Tomorrow" : `For ${when}`;
  if (live.length === 0) return `${label}, nothing is on the family calendar.`;

  const formatter = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone });
  const listed = live.slice(0, MAX_LISTED).map((event) => `${event.title} at ${formatter.format(event.startsAt).replace(/\s?(am|pm)/i, (m) => m.trim())}`);
  const rest = live.length - listed.length;
  return `${label}: ${listed.join(", ")}${rest > 0 ? `, and ${rest} more` : ""} — see ${linkTo("/family", "Family")}.`;
}

function describeHandled(handled: StatusFacts["handled"]): string {
  if (handled.length === 0) return "";
  return ` across ${handled.map((entry) => entry.title.toLowerCase()).join(", ")}`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function trimReason(reason: string): string {
  const clean = reason.trim().replace(/\.$/, "");
  return clean.length > 90 ? `${clean.slice(0, 87)}…` : clean;
}
