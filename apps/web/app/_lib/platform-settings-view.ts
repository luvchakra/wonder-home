import "server-only";
import { cache } from "react";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import type { PlatformAdmin } from "@wonderhome/core/platform/admin";
import { PLATFORM_SETTINGS, mayEdit, settingsForPage, type SettingDefinition, type SettingPage } from "@wonderhome/core/platform/settings/registry";
import { settingStatuses, type SettingStatus } from "@wonderhome/core/platform/settings/store";

import type { SettingRowView } from "../platform-admin/_ui/setting-row";

/**
 * What the settings screens are given: words from the registry and where each
 * value comes from. A secret's value is never read here (`settingStatuses`
 * returns only its last four), so nothing on these pages can carry one.
 */
export const platformSettingStatuses = cache(async (staff: PlatformAdmin) =>
  settingStatuses(adminClientFor(adminGrant.platformAdmin(staff, "show platform settings"))),
);

function lockedReason(entry: SettingDefinition, staff: PlatformAdmin): string | null {
  if (mayEdit(entry, staff.role)) return null;
  if (entry.kind === "secret" || entry.editableBy === "owner") return "Owner only";
  return "Operators and the owner can change this";
}

export function rowView(entry: SettingDefinition, status: SettingStatus | undefined, staff: PlatformAdmin): SettingRowView {
  const source = status?.source ?? "unset";
  return {
    key: entry.key,
    label: entry.label,
    description: entry.description,
    secret: entry.kind === "secret",
    options: entry.input.type === "choice" ? entry.input.options : null,
    numeric: entry.input.type === "number",
    source,
    shown: entry.kind === "secret" ? (source === "unset" ? null : status?.last4 ? `••••${status.last4}` : "••••") : (status?.value ?? null),
    inEnvironment: status?.inEnvironment ?? false,
    storeOnly: status?.storeOnly ?? false,
    updatedAt: status?.updatedAt ?? null,
    canEdit: mayEdit(entry, staff.role),
    lockedReason: lockedReason(entry, staff),
  };
}

/** One page's settings, grouped, each as a row view. */
export async function settingGroupsFor(staff: PlatformAdmin, page: SettingPage, kind?: "config" | "secret") {
  const { statuses, storeReady } = await platformSettingStatuses(staff);
  const groups = settingsForPage(page)
    .map((group) => ({ ...group, rows: group.settings.filter((entry) => !kind || entry.kind === kind).map((entry) => rowView(entry, statuses.get(entry.key), staff)) }))
    .filter((group) => group.rows.length > 0);
  return { groups, storeReady };
}

/** Every secret, grouped by what it belongs to, for the Secrets page. */
export async function secretGroups(staff: PlatformAdmin) {
  const { statuses, storeReady } = await platformSettingStatuses(staff);
  const pages: SettingPage[] = ["ai", "integrations", "configuration"];
  const groups = pages
    .flatMap((page) => settingsForPage(page))
    .map((group) => ({ ...group, rows: group.settings.filter((entry) => entry.kind === "secret").map((entry) => rowView(entry, statuses.get(entry.key), staff)) }))
    .filter((group) => group.rows.length > 0);
  return { groups, storeReady };
}

/** Totals for Overview: how many settings are saved here, still in Vercel, or not set. */
export async function settingTotals(staff: PlatformAdmin) {
  const { statuses, storeReady } = await platformSettingStatuses(staff);
  const totals = { saved: 0, environment: 0, unset: 0, stillInVercel: 0 };
  for (const entry of PLATFORM_SETTINGS) {
    const status = statuses.get(entry.key);
    if (!status) continue;
    if (status.source === "saved") totals.saved += 1;
    if (status.source === "environment") totals.environment += 1;
    if (status.source === "unset") totals.unset += 1;
    if (status.source === "saved" && status.inEnvironment) totals.stillInVercel += 1;
  }
  return { totals, storeReady, statuses };
}

/** What the one Razorpay card shows (owner, 2026-11-20). Never the secret: its last four at most. */
export type RazorpayCardView = {
  keyId: string | null;
  keyIdSource: SettingStatus["source"];
  secretSource: SettingStatus["source"];
  secretLast4: string | null;
  switchedOn: boolean;
  webhookUrl: string;
  webhookSecretInVercel: boolean;
  canEdit: boolean;
};

export async function razorpayCard(staff: PlatformAdmin, origin: string): Promise<RazorpayCardView> {
  const { statuses } = await platformSettingStatuses(staff);
  const id = statuses.get("RAZORPAY_KEY_ID");
  const secret = statuses.get("RAZORPAY_KEY_SECRET");
  const providers = statuses.get("WONDERHOME_BILLING_PROVIDERS")?.value ?? "none";
  const entries = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"].map((key) => PLATFORM_SETTINGS.find((entry) => entry.key === key));
  return {
    keyId: id?.value ?? null,
    keyIdSource: id?.source ?? "unset",
    secretSource: secret?.source ?? "unset",
    secretLast4: secret?.last4 ?? null,
    switchedOn: providers.split(",").includes("razorpay"),
    webhookUrl: `${origin}/api/v1/billing/webhook/razorpay`,
    webhookSecretInVercel: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim()),
    canEdit: staff.role === "owner" && entries.every((entry) => entry && mayEdit(entry, staff.role)),
  };
}
