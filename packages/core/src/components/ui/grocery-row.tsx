import {
  Apple,
  Baby,
  Carrot,
  ChevronRight,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Milk,
  PawPrint,
  Pill,
  ShoppingBasket,
  Soup,
  SprayCan,
  Sparkles,
  Wheat,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile } from "./icon-tile";

/**
 * One item on the Groceries list (Groceries Phase 1, design §3.1):
 *
 * `[status bar] [photo or tile] [name · category] [IN STOCK] [TO BUY stepper] [›]`
 *
 * The two amounts are separate cells and never stand in for each other. The
 * slim bar on the left says how much is at home — and says it in words too
 * (`statusLabel`, read by a screen reader and shown as a tooltip), so the
 * colour is never the only signal. Low stock is red or amber; "unknown" is
 * grey, because nobody has said how much there is and the row never guesses.
 *
 * The name wraps rather than truncating (rule 11). Under the name the
 * amounts sit as two equal cells — In stock, then To buy — each its label
 * over its own − amount + stepper, so they line up row after row (the
 * owner, 2026-10-20; 25-012 before it). Under the name, beside the category, the item's energy and
 * protein per 100 g when its catalog source has them. The stepper is the
 * caller's (it writes); the row is only the layout.
 */
export type GroceryStatus = "unknown" | "none" | "low" | "enough";

const BAR: Record<GroceryStatus, string> = {
  none: "bg-[var(--wh-risk)]",
  low: "bg-[var(--wh-attention)]",
  enough: "bg-[var(--wh-handled)]",
  unknown: "bg-[var(--wh-border-strong)]",
};

/** An illustrated tile for an item with no photo, picked from its name and category. */
export function groceryIcon(
  name: string,
  category: string,
): ComponentType<{ className?: string }> {
  const text = `${name} ${category}`.toLowerCase();
  const rules: [RegExp, ComponentType<{ className?: string }>][] = [
    [/\begg/, Egg],
    [/milk|curd|paneer|cheese|butter|yogh?urt|dairy|ghee|cream/, Milk],
    [/fish|prawn|seafood/, Fish],
    [/chicken|mutton|meat|lamb|pork|beef/, Drumstick],
    [/bread|bun|croissant|bakery|cake/, Croissant],
    [/rice|atta|flour|wheat|grain|dal|lentil|oats|pasta|cereal/, Wheat],
    [/apple|banana|mango|orange|grape|fruit|berr|papaya|melon/, Apple],
    [
      /vegetable|tomato|onion|potato|carrot|spinach|leaf|greens|coriander|chilli|ginger|garlic|cucumber|veg/,
      Carrot,
    ],
    [/spice|masala|salt|pepper|turmeric|cumin/, Flame],
    [/biscuit|cookie|snack|chips|namkeen|chocolate/, Cookie],
    [/juice|tea|coffee|drink|beverage|soda|water/, CupSoda],
    [/soup|sauce|oil|ketchup|pickle/, Soup],
    [/pet|dog|cat|kibble/, PawPrint],
    [/medic|tablet|pill|vitamin/, Pill],
    [/diaper|nappy|baby/, Baby],
    [/soap|shampoo|detergent|clean|household|toilet|dish/, SprayCan],
    [/personal|toothpaste|cosmetic/, Sparkles],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? ShoppingBasket;
}

export type GroceryRowProps = {
  name: string;
  category: string;
  href: string;
  /** A short-lived URL for the household's own photo, or null for the illustrated tile. */
  imageUrl?: string | null;
  status: GroceryStatus;
  /** The status in words ("Low", "Not known yet") — announced and shown on hover. */
  statusLabel: string;
  /** "In stock", in the reader's language. */
  stockLabel: string;
  /** "1.5 kg", or a dash when unknown. */
  stockText: string;
  /** The in-stock stepper, when this reader may change what is at home — the caller's, because it writes. */
  stockControl?: ReactNode;
  /** "To buy", in the reader's language. */
  toBuyLabel: string;
  /** The to-buy stepper — the caller's, because it writes. */
  stepper: ReactNode;
  /** "Open {name}" — the chevron's accessible name. */
  openLabel: string;
  /** "155 kcal · 13 g protein per 100 g", from the catalog's credited source, or nothing (25-012). */
  nutrition?: string | null;
  className?: string;
  /** "div" when a wrapper (`SwipeToDismiss`) is the list item itself. */
  as?: "li" | "div";
};

export function GroceryRow({
  name,
  category,
  href,
  imageUrl,
  status,
  statusLabel,
  stockLabel,
  stockText,
  stockControl,
  toBuyLabel,
  stepper,
  openLabel,
  nutrition,
  className,
  as: Tag = "li",
}: GroceryRowProps) {
  const icon = groceryIcon(name, category);
  const label = "text-[0.6875rem] leading-none font-semibold tracking-wide whitespace-nowrap text-[var(--wh-foreground-subtle)] uppercase";
  return (
    <Tag
      className={cn(
        // Phone: picture · name · chevron, then the amounts across the whole
        // card. Wider: one line, amounts before the chevron.
        "relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 py-1 pr-1 pl-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-4",
        className,
      )}
    >
      <span
        aria-hidden
        title={statusLabel}
        className={cn(
          "absolute top-2 bottom-2 left-0 w-1 rounded-full",
          BAR[status],
        )}
      />
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="col-start-1 row-start-1 rounded-[var(--wh-radius-sm)]"
      >
        {imageUrl ? (
          // A signed, short-lived URL for the household's own photo; next/image would cache it past its expiry.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="size-9 rounded-[var(--wh-radius-sm)] object-cover"
          />
        ) : (
          <IconTile icon={icon} tone="care" size="md" />
        )}
      </Link>
      <Link
        href={href}
        className="col-start-2 row-start-1 min-w-0 self-center rounded-[var(--wh-radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <span className="block text-[0.9375rem] leading-snug font-semibold break-words">
          {name}
        </span>
        <span className="block truncate text-xs leading-snug text-[var(--wh-foreground-muted)]">
          <span className="first-letter:uppercase">{category}</span>
          {nutrition ? <span className="text-[var(--wh-foreground-subtle)]"> · {nutrition}</span> : null}
        </span>
        <span className="sr-only">{statusLabel}</span>
      </Link>
      {/* In stock and To buy as two equal cells, each its label over its
          control, so the two steppers line up under each other row to row. */}
      <div className="col-span-3 row-start-2 grid grid-cols-2 gap-x-2 gap-y-0.5 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:grid-cols-[9.5rem_9.5rem]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0">
          <span className={label}>{stockLabel}</span>
          {stockControl ?? <span className="flex min-h-8 items-center text-sm font-semibold tabular-nums">{stockText}</span>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0">
          <span className={label}>{toBuyLabel}</span>
          {stepper}
        </div>
      </div>
      <Link
        href={href}
        aria-label={openLabel}
        className="col-start-3 row-start-1 grid size-8 place-items-center self-center rounded-full text-[var(--wh-foreground-subtle)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] sm:col-start-4"
      >
        <ChevronRight aria-hidden className="size-5" />
      </Link>
    </Tag>
  );
}
