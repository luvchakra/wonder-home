import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { LANGUAGE_CODES } from "@wonderhome/core/i18n/locales";
import { en } from "@wonderhome/core/i18n/messages/en";
import { loadCatalog, translator } from "@wonderhome/core/i18n/translate";
import { buildSettingsIndex, type SettingsViewer } from "@wonderhome/core/settings-search/build";
import { searchSettings } from "@wonderhome/core/settings-search/match";
import { SETTINGS_REGISTRY } from "@wonderhome/core/settings-search/registry";

const APP = join(__dirname, "..", "..");
const SETTINGS = join(APP, "settings");
const CORE_UI = join(__dirname, "..", "..", "..", "..", "..", "packages", "core", "src", "components");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== ".next") walk(path, out);
    } else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const appSource = [...walk(APP), ...walk(CORE_UI)].map((file) => readFileSync(file, "utf8")).join("\n");
// `id={`direct-add-${area}`}` carries several anchors: read each template as a pattern.
const idTemplates = [...appSource.matchAll(/\bid=\{`([^`]*\$\{[^`]*)`\}/g)].map((m) => new RegExp(`^${m[1]!.replace(/[.*+?^()|[\]\\]/g, "\\$&").replace(/\$\{[^}]*\}/g, "[a-z]+")}$`));
const hasAnchor = (anchor: string) => new RegExp(`(?:\\bid|\\bname)=\\{?["'\`]${anchor}["'\`]|\\bid: "${anchor}"`).test(appSource) || idTemplates.some((pattern) => pattern.test(anchor));

const pathOf = (href: string) => href.split("#")[0]!;
const anchorOf = (href: string) => href.split("#")[1];

describe("the settings search registry", () => {
  it("has unique ids and real parents", () => {
    const ids = SETTINGS_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of SETTINGS_REGISTRY) {
      if (entry.parent) expect(ids.includes(entry.parent), `${entry.id} -> ${entry.parent}`).toBe(true);
    }
  });

  it("only points at anchors the screens carry", () => {
    const missing = SETTINGS_REGISTRY.filter((entry) => anchorOf(entry.href) && !hasAnchor(anchorOf(entry.href)!)).map((entry) => `${entry.id}: #${anchorOf(entry.href)}`);
    expect(missing).toEqual([]);
  });

  it("lists every settings page, and the fold anchors on them", () => {
    const routes = new Set(SETTINGS_REGISTRY.map((entry) => pathOf(entry.href)));
    const pages = walk(SETTINGS)
      .filter((file) => file.endsWith("page.tsx"))
      .map((file) => "/" + relative(APP, file).replace(/\/?page\.tsx$/, ""))
      // Receipts and payment steps are reached from a payment, not searched for.
      .filter((route) => !/\/(checkout|confirmed)$/.test(route) && !route.includes("[invoiceId]"));
    const expected = pages.flatMap((route) => (route.endsWith("[field]") ? ["language", "region", "currency", "datetime", "members"].map((f) => route.replace("[field]", f)) : [route]));
    // `/settings` itself is the search page; its cards are the entries under it.
    expect(expected.filter((route) => route !== "/settings" && !routes.has(route))).toEqual([]);

    const anchors = new Set(SETTINGS_REGISTRY.map((entry) => anchorOf(entry.href)).filter(Boolean));
    const found: string[] = [];
    for (const file of walk(SETTINGS)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<(?:CollapsibleSection|ProviderCard|section)\b[^>]*?\sid="([^"]+)"/g)) found.push(m[1]!);
    }
    // Hubs that only group links, and anchors reached only by a link inside the page.
    const notSettings = new Set(["billing"]); // a fold holding only the link to a registered page (plan-billing)
    expect(found.filter((id) => !anchors.has(id) && !notSettings.has(id))).toEqual([]);
  });
});

const viewer = (over: Partial<SettingsViewer> = {}): SettingsViewer => ({ isAdmin: false, memberType: "adult", canManageIntegrations: false, developerAccess: false, ...over });
const tEn = translator("en", en);
const labels = (v: SettingsViewer) => buildSettingsIndex(v, tEn, tEn).map((item) => item.id);

describe("who is shown which settings", () => {
  it("hides Admin items from non-Admins and personal-only items from children", () => {
    const adult = labels(viewer());
    expect(adult).not.toContain("playbook");
    expect(adult).not.toContain("address");
    expect(adult).not.toContain("plan-cancel");
    expect(adult).toContain("privacy-delete");
    expect(adult).toContain("voice"); // the page; its form fields are Admin-only
    expect(adult).not.toContain("voice-speed");

    const child = labels(viewer({ memberType: "child" }));
    expect(child).not.toContain("location-sharing");
    expect(child).not.toContain("shopping");
    expect(child).toContain("language");
  });

  it("shows Admin items to Admins, and developer access only when it is on", () => {
    const admin = labels(viewer({ isAdmin: true, canManageIntegrations: true }));
    expect(admin).toContain("playbook");
    expect(admin).toContain("voice-speed");
    expect(admin).not.toContain("developer");
    expect(labels(viewer({ isAdmin: true, canManageIntegrations: true, developerAccess: true }))).toContain("developer");
  });

  it("holds labels and keywords only, never a platform screen", () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.href.startsWith("/settings") || ["/family", "/household/responsibilities"].includes(pathOf(entry.href)), entry.id).toBe(true);
    }
    for (const item of buildSettingsIndex(viewer({ isAdmin: true, canManageIntegrations: true, developerAccess: true }), tEn, tEn)) {
      expect(Object.keys(item).sort()).toEqual(["crumbs", "href", "id", "keywords", "keywordsEn", "label", "labelEn"].concat(item.description ? ["description"] : []).sort());
    }
  });

  it("has a label and, where flagged, synonyms in every language", async () => {
    for (const language of LANGUAGE_CODES) {
      const t = translator(language, await loadCatalog(language));
      for (const item of buildSettingsIndex(viewer({ isAdmin: true, canManageIntegrations: true, developerAccess: true }), t, tEn)) {
        expect(item.label, `${language} ${item.id}`).not.toBe("");
        expect(item.keywords, `${language} ${item.id}`).not.toBe("");
      }
    }
  });
});

describe("searching the real index lands on the right setting", () => {
  const admin = buildSettingsIndex(viewer({ isAdmin: true, canManageIntegrations: true, developerAccess: true }), tEn, tEn);
  const top = (query: string) => searchSettings(admin, query)[0]?.item.id;
  it.each([
    ["speed", "voice-speed"],
    ["rupee", "currency"],
    ["mute", "quiet-hours"],
    ["invite", "members"],
    ["delete account", "privacy-delete"],
    ["password", "privacy"],
    ["api key", "ai-api-key"],
    ["wifi", undefined],
    ["speeed", "voice-speed"],
  ])("%s", (query, id) => {
    expect(top(query)).toBe(id);
  });
});
