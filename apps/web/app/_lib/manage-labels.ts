import type { Translate } from "@wonderhome/core/i18n/translate";

import type { ConfigFormLabels } from "../_components/config-forms";
import type { DeveloperKeyLabels } from "../_components/developer-keys";
import type { DeviceLinkLabels } from "../_components/device-link-controls";
import type { PlaybookControlLabels } from "../_components/playbook-controls";
import type { ResponsibilityLabels } from "../_components/responsibility-controls";
import type { WeatherAreaLabels } from "../_components/weather-area";
import { STARTER_OUTCOMES } from "./starter-outcomes";

/**
 * Manage Household's words in the viewer's language (story 22-004), built
 * on the server and handed to the client controls as plain strings.
 *
 * Only the words change. Stored values — an autonomy mode, a policy
 * category, an outcome key — are never translated, and neither is anything
 * the household typed.
 */

export const AUTONOMY_MODES = ["observe", "prepare", "approve", "execute"] as const;
export type AutonomyModeKey = (typeof AUTONOMY_MODES)[number];

const POLICY_CATEGORY_KEYS = ["spending", "privacy", "family_time", "notifications", "ai_autonomy", "safety"] as const;

/** A policy category in the reader's words; one this screen does not know is shown as stored. */
export function policyCategoryWords(category: string, t: Translate): string {
  return (POLICY_CATEGORY_KEYS as readonly string[]).includes(category)
    ? t(`manage.policyCategory.${category as (typeof POLICY_CATEGORY_KEYS)[number]}`)
    : category.replace(/_/g, " ");
}

/** The starter outcomes offered before a household has written its own, in the reader's words. */
export function starterOutcomes(t: Translate): { key: string; label: string }[] {
  return STARTER_OUTCOMES.map((starter) => ({
    key: starter.key,
    label: t(`manage.starter.${starter.key}` as Parameters<Translate>[0]) || starter.label,
  }));
}

/** "7 times", "about 1 time", "less than once" — `formatPerWeek`'s arithmetic, in the reader's words. */
export function perWeekWords(perWeek: number, t: Translate): string {
  const value = Math.round(perWeek * 100) / 100;
  if (value === 0) return t("manage.perWeek.nothing");
  if (value < 1) return t("manage.perWeek.lessThanOnce");
  const whole = Math.round(value);
  return Number.isInteger(value) ? t("manage.perWeek.times", { count: whole }) : t("manage.perWeek.aboutTimes", { count: whole });
}

export function configFormLabels(t: Translate): ConfigFormLabels {
  return {
    saving: t("common.saving"),
    nobodyYet: t("manage.resp.nobodyYet"),
    outcome: t("manage.form.outcome"),
    owner: t("manage.form.owner"),
    backup: t("manage.form.backup"),
    backupHint: t("manage.form.backupHint"),
    aiMode: t("manage.form.aiMode"),
    aiModes: {
      observe: t("manage.aiMode.observe"),
      prepare: t("manage.aiMode.prepare"),
      approve: t("manage.aiMode.approve"),
      execute: t("manage.aiMode.execute"),
    },
    aiModeHint: t("manage.form.aiModeHint"),
    priority: t("manage.form.priority"),
    priority1: t("manage.form.priority1"),
    priority3: t("manage.form.priority3"),
    priority5: t("manage.form.priority5"),
    priorityHint: t("manage.form.priorityHint"),
    saveChanges: t("manage.form.saveChanges"),
    saveResponsibility: t("manage.form.saveResponsibility"),
    name: t("manage.form.name"),
    playbookNamePlaceholder: t("manage.form.playbookNamePlaceholder"),
    playbookNameHint: t("manage.form.playbookNameHint"),
    definition: t("manage.form.definition"),
    definitionPlaceholder: t("manage.form.definitionPlaceholder"),
    definitionHint: t("manage.form.definitionHint"),
    moreDetail: t("manage.form.moreDetail"),
    fromHour: t("manage.form.fromHour"),
    toHour: t("manage.form.toHour"),
    escalate: t("manage.form.escalate"),
    escalateHint: t("manage.form.escalateHint"),
    dependsOn: t("manage.form.dependsOn"),
    dependsOnNothing: t("manage.form.dependsOnNothing"),
    dependsOnHint: t("manage.form.dependsOnHint"),
    savePlaybook: t("manage.form.savePlaybook"),
    nextVersion: t("manage.form.nextVersion"),
    governs: t("manage.form.governs"),
    categories: Object.fromEntries(POLICY_CATEGORY_KEYS.map((category) => [category, t(`manage.policyCategory.${category}`)])),
    policyNamePlaceholder: t("manage.form.policyNamePlaceholder"),
    limit: t("manage.form.limit"),
    limitHint: t("manage.form.limitHint"),
    note: t("manage.form.note"),
    notePlaceholder: t("manage.form.notePlaceholder"),
    narrow: t("manage.form.narrow"),
    appliesTo: t("manage.form.appliesTo"),
    everyone: t("manage.form.everyone"),
    adults: t("manage.form.adults"),
    children: t("manage.form.children"),
    helpers: t("manage.form.helpers"),
    appliesToHint: t("manage.form.appliesToHint"),
    saveNewVersion: t("manage.form.saveNewVersion"),
    savePolicy: t("manage.form.savePolicy"),
    teach: t("manage.form.teach"),
    teachPlaceholder: t("manage.form.teachPlaceholder"),
    teachHint: t("manage.form.teachHint"),
    teachSee: t("manage.form.teachSee"),
    whatYouCanSay: t("manage.form.whatYouCanSay"),
    saved: t("common.saved"),
    yesDoThat: t("manage.form.yesDoThat"),
  };
}

export function playbookControlLabels(t: Translate): PlaybookControlLabels {
  return {
    edit: t("manage.edit"),
    pause: t("manage.pause"),
    resume: t("manage.resume"),
    standDown: t("manage.standDown"),
    playbookSheetLede: t("manage.playbookSheetLede"),
    policySheetLede: t("manage.policySheetLede"),
    form: configFormLabels(t),
  };
}

export function responsibilityLabels(t: Translate): ResponsibilityLabels {
  const name = { name: "{name}" };
  return {
    add: t("manage.resp.add"),
    addTitle: t("manage.resp.addTitle"),
    addLede: t("manage.resp.addLede"),
    owner: t("manage.resp.owner"),
    backup: t("manage.resp.backup"),
    frequency: t("manage.resp.frequency"),
    adminOnly: t("manage.resp.adminOnly"),
    remove: t("manage.resp.remove"),
    removeTitle: t("manage.resp.removeTitle", name),
    removeLede: t("manage.resp.removeLede"),
    removeConfirm: t("manage.resp.removeConfirm"),
    giveTo: t("manage.resp.giveTo", name),
    swapping: t("manage.resp.swapping"),
    swap: t("manage.resp.swap"),
    form: configFormLabels(t),
  };
}

export function developerKeyLabels(t: Translate): DeveloperKeyLabels {
  const name = { name: "{name}" };
  return {
    intro: t("manage.keys.intro"),
    newKey: t("manage.keys.new"),
    none: t("manage.keys.none"),
    revoked: t("manage.keys.revoked"),
    live: t("manage.keys.live"),
    sandbox: t("manage.keys.sandbox"),
    sheetTitle: t("manage.keys.sheetTitle"),
    sheetLede: t("manage.keys.sheetLede"),
    copied: t("manage.keys.copied"),
    copy: t("manage.keys.copy"),
    name: t("manage.form.name"),
    namePlaceholder: t("manage.keys.namePlaceholder"),
    kind: t("manage.keys.kind"),
    sandboxLede: t("manage.keys.sandboxLede"),
    liveLede: t("manage.keys.liveLede"),
    mayDo: t("manage.keys.mayDo"),
    expiresAfter: t("manage.keys.expiresAfter"),
    days30: t("manage.keys.days30"),
    days90: t("manage.keys.days90"),
    year: t("manage.keys.year"),
    never: t("manage.keys.never"),
    create: t("manage.keys.create"),
    creating: t("manage.keys.creating"),
    revoke: t("manage.keys.revoke", name),
    revokeTitle: t("manage.keys.revokeTitle", name),
    revokeLede: t("manage.keys.revokeLede"),
    revokeConfirm: t("manage.keys.revokeConfirm"),
  };
}

export function deviceLinkLabels(t: Translate): DeviceLinkLabels {
  const name = { name: "{name}" };
  return {
    which: t("manage.device.which", name),
    useAgain: t("manage.device.useAgain", name),
    ignore: t("manage.device.ignore", name),
    whichLede: t("manage.device.whichLede"),
    appliance: t("manage.device.appliance"),
    notLinked: t("manage.device.notLinked"),
    notListed: t("manage.device.notListed"),
    newName: t("manage.device.newName"),
    newNamePlaceholder: t("manage.device.newNamePlaceholder"),
    newCategory: t("manage.device.newCategory"),
    categories: {
      appliance: t("manage.device.category.appliance"),
      fixture: t("manage.device.category.fixture"),
      electronics: t("manage.device.category.electronics"),
      vehicle: t("manage.device.category.vehicle"),
      furniture: t("manage.device.category.furniture"),
      other: t("manage.device.category.other"),
    },
    saving: t("common.saving"),
    save: t("common.save"),
    ignoreTitle: t("manage.device.ignoreTitle", name),
    ignoreLede: t("manage.device.ignoreLede"),
    ignoreConfirm: t("manage.device.ignoreConfirm"),
  };
}

export function weatherAreaLabels(t: Translate): WeatherAreaLabels {
  return {
    checked: t("manage.weather.checked", { when: "{when}" }),
    privacy: t("manage.weather.privacy"),
    change: t("manage.weather.change"),
    offQuestion: t("manage.weather.offQuestion"),
    switchingOff: t("manage.weather.switchingOff"),
    yesOff: t("manage.weather.yesOff"),
    keep: t("manage.weather.keep"),
    off: t("manage.weather.off"),
    town: t("manage.weather.town"),
    townPlaceholder: t("manage.weather.townPlaceholder"),
    finding: t("manage.weather.finding"),
    find: t("manage.weather.find"),
    whichOne: t("manage.weather.whichOne"),
    saving: t("common.saving"),
    use: t("manage.weather.use"),
    cancel: t("manage.weather.cancel"),
  };
}
