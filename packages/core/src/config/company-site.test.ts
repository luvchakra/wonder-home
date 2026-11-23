import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { settingDefinition } from "../platform/settings/registry";
import { companySiteUrl } from "./contact";

const appDir = join(__dirname, "../../../../apps/web/app");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the company site is a Platform admin setting, empty by default (owner, 2026-11-23)", () => {
  it("is an operator-editable https setting with no default", () => {
    const entry = settingDefinition("WONDERHOME_COMPANY_SITE_URL");
    expect(entry).not.toBeNull();
    expect(entry!.editableBy).toBe("operator");
    expect(entry!.kind).toBe("config");
    expect(entry!.defaultValue).toBeNull();
    expect(entry!.schema.safeParse("https://wonderapps.biz").success).toBe(true);
    expect(entry!.schema.safeParse("http://wonderapps.biz").success).toBe(false);
  });

  it("reads null when unset, blank or not https, and the address when set", () => {
    expect(companySiteUrl({})).toBeNull();
    expect(companySiteUrl({ WONDERHOME_COMPANY_SITE_URL: "  " })).toBeNull();
    expect(companySiteUrl({ WONDERHOME_COMPANY_SITE_URL: "http://wonderapps.biz" })).toBeNull();
    expect(companySiteUrl({ WONDERHOME_COMPANY_SITE_URL: " https://wonderapps.biz " })).toBe("https://wonderapps.biz");
  });

  it("no page hard-codes a link to the company site", () => {
    const offenders = sources(appDir)
      .filter((path) => /href=["{`]+https:\/\/(www\.)?wonderapps\.biz/.test(readFileSync(path, "utf8")))
      .map((path) => relative(appDir, path));
    expect(offenders).toEqual([]);
  });
});
