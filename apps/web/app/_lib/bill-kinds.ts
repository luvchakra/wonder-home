/**
 * The kinds of bill, in the words the Bills screen uses. A plain module so a
 * server page and a client form read the same list — a "use client" module
 * cannot hand plain values to server code.
 */
export const BILL_KINDS = [
  { value: "utility", label: "Utility" },
  { value: "rent", label: "Rent" },
  { value: "school_fee", label: "School fee" },
  { value: "subscription", label: "Subscription" },
  { value: "insurance", label: "Insurance" },
  { value: "loan", label: "Loan" },
  { value: "tax", label: "Tax" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
] as const;

export function billKindLabel(kind: string): string {
  return BILL_KINDS.find((k) => k.value === kind)?.label ?? kind;
}
