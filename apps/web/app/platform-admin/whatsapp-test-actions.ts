"use server";

import { headers } from "next/headers";

import { recordAuditEvent } from "@wonderhome/core/api/audit";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { settingDefinition } from "@wonderhome/core/platform/settings/registry";
import { forgetRuntimeEnv, freshRuntimeEnv } from "@wonderhome/core/platform/settings/runtime-env";
import { settingStatuses } from "@wonderhome/core/platform/settings/store";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import {
  checkAccessToken,
  checkAppSubscription,
  checkWabaSubscription,
  checkWebhookSelfTest,
  graphVersionLine,
  settingsLine,
  summaryLine,
  type CheckLine,
  type SettingSourceLine,
} from "@wonderhome/core/whatsapp/self-check";

import { platformStaff } from "../_lib/platform-staff";

export type WhatsAppTestState = { ok: boolean | null; summary: string | null; lines: CheckLine[] };

/** The settings the test reports on, in the card's order; `required` ones stop the channel when missing. */
const SETTINGS: readonly { key: string; required: boolean }[] = [
  { key: "WHATSAPP_ACCESS_TOKEN", required: true },
  { key: "WHATSAPP_PHONE_NUMBER_ID", required: true },
  { key: "WHATSAPP_TEMPLATE_NAME", required: true },
  { key: "WHATSAPP_TEMPLATE_LANGUAGE", required: false },
  { key: "WHATSAPP_APP_SECRET", required: true },
  { key: "WHATSAPP_VERIFY_TOKEN", required: true },
  { key: "WHATSAPP_BUSINESS_NUMBER", required: false },
  { key: "WHATSAPP_APP_ID", required: false },
  { key: "WHATSAPP_BUSINESS_ACCOUNT_ID", required: false },
];

async function webhookUrl(): Promise<string> {
  const host = (await headers()).get("host") ?? "home.wonderapps.biz";
  const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
  return `${scheme}://${host}/api/v1/whatsapp/webhook`;
}

/**
 * "Test WhatsApp" (owner, 2026-11-22). Platform staff who may change settings
 * only; six runs per ten minutes each; audited with each check's result.
 * Reads the store afresh, so a value saved a moment ago is the one tested.
 * Never returns a secret: lines carry setting names, Meta's display number and
 * names, and "ends in XXXX" at most.
 */
export async function testWhatsAppAction(): Promise<WhatsAppTestState> {
  const staff = await platformStaff("settings.manage");
  if (!staff) return { ok: false, summary: "Your role can't test WhatsApp.", lines: [] };
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "test the WhatsApp connection"));
  if (!(await hitRateLimit(admin, "platform.whatsapp_test", staff.profileId))) return { ok: false, summary: rateLimitMessage("platform.whatsapp_test"), lines: [] };

  forgetRuntimeEnv();
  const [env, { statuses }, url] = await Promise.all([freshRuntimeEnv(), settingStatuses(admin, process.env), webhookUrl()]);
  const value = (key: string) => env[key]?.trim() || null;

  const sources: SettingSourceLine[] = SETTINGS.map(({ key, required }) => ({
    key,
    required,
    label: settingDefinition(key)?.label ?? key,
    source: statuses.get(key)?.source ?? "unset",
  }));
  const [token, appSubscription, waba, selfTest] = await Promise.all([
    checkAccessToken({ accessToken: value("WHATSAPP_ACCESS_TOKEN"), phoneNumberId: value("WHATSAPP_PHONE_NUMBER_ID"), businessNumber: value("WHATSAPP_BUSINESS_NUMBER") }),
    checkAppSubscription({ appId: value("WHATSAPP_APP_ID"), appSecret: value("WHATSAPP_APP_SECRET"), expectedUrl: url }),
    checkWabaSubscription({ wabaId: value("WHATSAPP_BUSINESS_ACCOUNT_ID"), appId: value("WHATSAPP_APP_ID"), accessToken: value("WHATSAPP_ACCESS_TOKEN"), expectedUrl: url }),
    checkWebhookSelfTest({ webhookUrl: url, appSecret: value("WHATSAPP_APP_SECRET") }),
  ]);
  const lines = [settingsLine(sources), token, appSubscription, waba, selfTest, graphVersionLine()];
  const summary = summaryLine(lines);

  await recordAuditEvent(admin, {
    householdId: null,
    eventType: "platform.whatsapp_tested",
    actorProfileId: staff.profileId,
    metadata: { summary: summary.text, results: Object.fromEntries(lines.map((line) => [line.id, line.ok])) },
  });
  return { ok: summary.ok, summary: summary.text, lines };
}
