/**
 * The kinds of bill. A plain module so a server page and a client form read
 * the same list — a "use client" module cannot hand plain values to server
 * code. `value` is what is stored; what a person reads is `bills.kind.*` in
 * their language (story 22-004, `billKindName`). `label` is the English a
 * transaction's free-text kind is written in, which stays as saved.
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
