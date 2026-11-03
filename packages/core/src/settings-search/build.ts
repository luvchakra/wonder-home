import type { Translate, TranslationKey } from "../i18n/translate";
import type { SearchItem } from "./match";
import { SETTINGS_REGISTRY, type Audience } from "./registry";

/** What the viewer is, as the server knows it. Presentation only: the pages still check. */
export type SettingsViewer = {
  isAdmin: boolean;
  memberType: "adult" | "child" | "helper" | string;
  canManageIntegrations: boolean;
  developerAccess: boolean;
};

export function mayShow(who: Audience, viewer: SettingsViewer): boolean {
  switch (who) {
    case "everyone":
      return true;
    case "nonChild":
      return viewer.memberType !== "child";
    case "adult":
      return viewer.memberType === "adult";
    case "admin":
      return viewer.isAdmin;
    case "integrations":
      return viewer.canManageIntegrations;
    case "developer":
      return viewer.canManageIntegrations && viewer.developerAccess;
  }
}

/**
 * The compact index for one viewer: labels, breadcrumbs and synonyms in their language, with
 * English alongside as the fallback. Entries the viewer may not use are left out, and so is
 * every entry under a parent they may not see. Never any household data.
 */
export function buildSettingsIndex(viewer: SettingsViewer, t: Translate, tEn: Translate): SearchItem[] {
  const byId = new Map(SETTINGS_REGISTRY.map((entry) => [entry.id, entry]));
  const visible = new Map<string, boolean>();
  const isVisible = (id: string): boolean => {
    const known = visible.get(id);
    if (known !== undefined) return known;
    const entry = byId.get(id);
    const ok = !entry ? true : mayShow(entry.who, viewer) && (!entry.parent || isVisible(entry.parent));
    visible.set(id, ok);
    return ok;
  };
  const crumbs = (id: string, tr: Translate): string[] => {
    const entry = byId.get(id);
    if (!entry?.parent) return [];
    const parent = byId.get(entry.parent);
    const label = parent ? tr(parent.label) : "";
    return [...crumbs(entry.parent, tr), ...(label ? [label] : [])];
  };
  const kw = (id: string, tr: Translate) => tr(`settingsSearch.kw.${id}` as TranslationKey);

  return SETTINGS_REGISTRY.filter((entry) => isVisible(entry.id)).map((entry) => ({
    id: entry.id,
    label: t(entry.label),
    crumbs: crumbs(entry.id, t),
    keywords: entry.kw ? kw(entry.id, t) : "",
    ...(entry.desc ? { description: t(entry.desc) } : {}),
    href: entry.href,
    labelEn: tEn(entry.label),
    keywordsEn: entry.kw ? kw(entry.id, tEn) : "",
  }));
}
