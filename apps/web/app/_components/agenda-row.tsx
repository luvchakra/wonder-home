import { PawPrint, Shirt, Sparkles, Wrench } from "lucide-react";
import type { ComponentType } from "react";

import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import type { IconTone } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";

/**
 * One assessment, rendered as the row the mockups use everywhere.
 *
 * The icon and colour come from the domain rather than the urgency, so the same
 * thing looks the same wherever it appears. The words come from the engine —
 * this component never composes its own explanation of why something is here.
 */
const BY_DOMAIN: Record<string, { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  asset: { icon: Wrench, tone: "home" },
  service: { icon: Wrench, tone: "home" },
  laundry: { icon: Shirt, tone: "care" },
  pet: { icon: PawPrint, tone: "care" },
  home: { icon: Sparkles, tone: "home" },
};

/** The action in the family's words rather than the engine's. */
const ACTION_LABEL: Record<string, string> = {
  book_service: "Book",
  review_coverage: "Review",
  claim_cover: "Claim",
  chase_provider: "Chase",
  do_next_action: "Do it",
  set_next_action: "Decide",
  confirm_visit: "Confirm",
  start_now: "Start",
  dry_indoors: "Move it",
  find_cover: "Find cover",
  find_alternative: "Options",
  order_supplies: "Order",
  book_appointment: "Book",
  give_medication: "Give",
  arrange_grooming: "Arrange",
  plan_walk: "Plan",
};

/**
 * The engine's sentence names the thing, because a notification has no heading
 * to lean on. A row does, so the repetition is dropped here rather than weakened
 * at the source.
 */
function withoutLeadingName(title: string, reason: string): string {
  if (!reason.startsWith(title)) return reason;

  const rest = reason.slice(title.length).replace(/^[\s:,'’]*/, "");
  if (rest.length === 0) return reason;

  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export function AgendaRow({ item }: { item: HomeAssessment }) {
  const domain = item.subjectKey.split(".")[0] ?? "home";
  const presentation = BY_DOMAIN[domain] ?? BY_DOMAIN.home!;
  const label = item.action ? (ACTION_LABEL[item.action.action] ?? "Open") : null;

  return (
    <ActionRow
      icon={presentation.icon}
      tone={presentation.tone}
      title={item.title}
      meta={withoutLeadingName(item.title, item.reason)}
      action={
        label ? (
          <Pill tone={item.riskLevel === "high" ? "primary" : "soft"} type="button">
            {label}
          </Pill>
        ) : null
      }
    />
  );
}
