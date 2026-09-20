import { GraduationCap, HandHeart, ListChecks, PawPrint, ShoppingBasket, Utensils, Wallet, Wrench } from "lucide-react";
import type { ComponentType } from "react";

import type { IconTone } from "@wonderhome/core/ui/icon-tile";

const BY_PREFIX: Record<string, { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  school: { icon: GraduationCap, tone: "school" },
  bills: { icon: Wallet, tone: "money" },
  finance: { icon: Wallet, tone: "money" },
  groceries: { icon: ShoppingBasket, tone: "care" },
  shopping: { icon: ShoppingBasket, tone: "care" },
  meals: { icon: Utensils, tone: "meals" },
  kitchen: { icon: Utensils, tone: "meals" },
  laundry: { icon: Wrench, tone: "home" },
  home: { icon: Wrench, tone: "home" },
  cleaning: { icon: Wrench, tone: "home" },
  pet: { icon: PawPrint, tone: "care" },
  pets: { icon: PawPrint, tone: "care" },
  kids: { icon: HandHeart, tone: "people" },
};

/** An outcome key's domain prefix decides its icon and tone — "laundry.ready" reads as a laundry row wherever it's listed. */
export function iconForOutcome(outcomeKey: string): { icon: ComponentType<{ className?: string }>; tone: IconTone } {
  const prefix = outcomeKey.split(".")[0] ?? "";
  return BY_PREFIX[prefix] ?? { icon: ListChecks, tone: "primary" };
}
