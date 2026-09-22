import {
  CalendarHeart,
  Gift,
  GraduationCap,
  HeartPulse,
  MessageSquareText,
  PawPrint,
  ShoppingBasket,
  Shirt,
  Sparkles,
  TriangleAlert,
  Utensils,
  Wallet,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import type { IconTone } from "@wonderhome/core/ui/icon-tile";
import { PillLink } from "@wonderhome/core/ui/pill";

/**
 * One assessment, rendered as the row the mockups use everywhere.
 *
 * The icon and colour come from the domain rather than the urgency, so the same
 * thing looks the same wherever it appears. The words come from the engine —
 * this component never composes its own explanation of why something is here.
 */
type Presentation = { icon: ComponentType<{ className?: string }>; tone: IconTone; href: string };

const BY_DOMAIN: Record<string, Presentation> = {
  asset: { icon: Wrench, tone: "home", href: "/household/home" },
  service: { icon: Wrench, tone: "home", href: "/household/home" },
  laundry: { icon: Shirt, tone: "care", href: "/household/home" },
  pet: { icon: PawPrint, tone: "care", href: "/household/home" },
  home: { icon: Sparkles, tone: "home", href: "/household/home" },
  school: { icon: GraduationCap, tone: "school", href: "/school" },
  item: { icon: GraduationCap, tone: "school", href: "/school" },
  communication: { icon: MessageSquareText, tone: "school", href: "/school" },
  consumable: { icon: ShoppingBasket, tone: "care", href: "/groceries" },
  order: { icon: ShoppingBasket, tone: "care", href: "/groceries" },
  meal: { icon: Utensils, tone: "meals", href: "/meals" },
  obligation: { icon: Wallet, tone: "money", href: "/bills" },
  bill: { icon: Wallet, tone: "money", href: "/bills" },
  anomaly: { icon: TriangleAlert, tone: "money", href: "/bills" },
  event: { icon: CalendarHeart, tone: "people", href: "/family" },
  gift: { icon: Gift, tone: "people", href: "/family" },
  conflict: { icon: CalendarHeart, tone: "people", href: "/family" },
  appointment: { icon: HeartPulse, tone: "health", href: "/health" },
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
  make_time: "Plan",
  check_with_child: "Check in",
  school_respond: "Reply",
  add_to_cart: "Add",
  chase_order: "Track",
  start_cooking: "Start",
  find_cook: "Assign",
  substitute: "Swap",
  shop_for_meal: "Shop",
  replan_meal: "Change",
  pay_bill: "Pay",
  review_bill: "Review",
  needs_rsvp: "Reply",
  needs_gift: "Gift",
  needs_preparation: "Prepare",
  needs_travel: "Plan",
  choose_gift: "Choose",
  order_gift: "Order",
  sort_gift: "Sort",
  move_left: "Resolve",
  move_right: "Resolve",
  drop_optional: "Resolve",
  ask_household: "Decide",
  confirm_appointment: "Confirm",
  review_conflict: "Review",
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

export function presentationFor(subjectKey: string): Presentation {
  const domain = subjectKey.split(".")[0] ?? "home";
  return BY_DOMAIN[domain] ?? BY_DOMAIN.home!;
}

export function actionLabelFor(action: string | undefined): string {
  return action ? (ACTION_LABEL[action] ?? "Open") : "Open";
}

export function AgendaRow({ item, href }: { item: HomeAssessment; href?: string }) {
  const presentation = presentationFor(item.subjectKey);
  const label = item.action ? actionLabelFor(item.action.action) : null;

  return (
    <ActionRow
      icon={presentation.icon}
      tone={presentation.tone}
      title={item.title}
      meta={withoutLeadingName(item.title, item.reason)}
      action={
        label ? (
          <PillLink href={href ?? presentation.href} tone={item.riskLevel === "high" ? "primary" : "soft"}>
            {label}
          </PillLink>
        ) : null
      }
    />
  );
}
