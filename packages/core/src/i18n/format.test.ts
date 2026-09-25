import { describe, expect, it } from "vitest";

import { formatterFor } from "./format";
import { describeTimezone, isTimezone } from "./locales";
import { DEFAULT_PREFERENCES, intlLocale, NO_MEMBER_CHOICES, parseHouseholdSettings, parseMemberChoices, regionSuggestions, resolvePreferences } from "./preferences";

const INDIA = { region: "IN" as const, currency: null, timezone: "Asia/Kolkata", measurement: null, language: null };
const US = { region: "US" as const, currency: null, timezone: "America/New_York", measurement: null, language: null };
const AT = new Date("2026-09-23T10:00:00Z"); // 15:30 in Kolkata, 06:00 in New York

describe("whose choice wins", () => {
  it("a person's own choice beats the household, the household beats the region", () => {
    const household = { ...INDIA, measurement: "imperial" as const, language: "hi" as const };
    expect(resolvePreferences(NO_MEMBER_CHOICES, household)).toMatchObject({ language: "hi", measurement: "imperial", currency: "INR", dateFormat: "dmy" });
    expect(resolvePreferences({ language: "en", dateFormat: "ymd", timeFormat: "24h", measurement: "metric" }, household)).toMatchObject({
      language: "en",
      dateFormat: "ymd",
      timeFormat: "24h",
      measurement: "metric",
    });
  });

  it("a region only fills what nobody decided", () => {
    expect(resolvePreferences(NO_MEMBER_CHOICES, US)).toMatchObject({ currency: "USD", measurement: "imperial", dateFormat: "mdy", timeFormat: "12h" });
    expect(resolvePreferences(NO_MEMBER_CHOICES, { ...US, currency: "EUR" }).currency).toBe("EUR");
  });

  it("defaults are English, India, rupees, metric", () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({ language: "en", region: "IN", currency: "INR", measurement: "metric", dir: "ltr" });
  });

  it("Chinese in Singapore: Simplified characters, Singapore dollars, the household's clock", () => {
    const singapore = { region: "SG" as const, currency: null, timezone: "Asia/Singapore", measurement: null, language: null };
    const prefs = resolvePreferences({ ...NO_MEMBER_CHOICES, language: "zh" }, singapore);
    expect(prefs).toMatchObject({ language: "zh", currency: "SGD", timezone: "Asia/Singapore", dir: "ltr" });
    expect(intlLocale(prefs)).toBe("zh-Hans-SG");
    const format = formatterFor(prefs);
    expect(format.money(12.5)).toContain("12.50");
    expect(format.date("2026-09-25")).toMatch(/9月25日/);
  });

  it("Arabic reads right to left", () => {
    expect(resolvePreferences({ ...NO_MEMBER_CHOICES, language: "ar" }, INDIA).dir).toBe("rtl");
  });

  it("changing region suggests, and never includes what is already the region's", () => {
    expect(regionSuggestions("US", { currency: "EUR", timezone: "Asia/Kolkata", measurement: "metric" })).toEqual({ currency: "USD", timezone: "America/New_York", measurement: "imperial" });
    expect(regionSuggestions("IN", { currency: "INR", timezone: "Asia/Kolkata", measurement: "metric" })).toEqual({});
  });

  it("unrecognised stored values are 'not chosen', never an error", () => {
    expect(parseMemberChoices({ language: "klingon", date_format: "dd.mm", time_format: "24h", measurement_system: 3 })).toEqual({ language: null, dateFormat: null, timeFormat: "24h", measurement: null });
    expect(parseHouseholdSettings({ region: "XX", currency: "BTC", timezone: "Asia/Kolkata" })).toMatchObject({ region: null, currency: null });
  });

  it("the Intl locale is the person's language in the household's region", () => {
    expect(intlLocale({ language: "hi", region: "IN" })).toBe("hi-IN");
    expect(intlLocale({ language: "en", region: "US" })).toBe("en-US");
  });
});

describe("the one formatter", () => {
  const india = formatterFor(resolvePreferences(NO_MEMBER_CHOICES, INDIA));
  const us = formatterFor(resolvePreferences(NO_MEMBER_CHOICES, US));

  it("writes a numeric date the way the person chose", () => {
    expect(india.numericDate("2026-09-23")).toBe("23/09/2026");
    expect(us.numericDate("2026-09-23")).toBe("09/23/2026");
    const iso = formatterFor(resolvePreferences({ ...NO_MEMBER_CHOICES, dateFormat: "ymd" }, INDIA));
    expect(iso.numericDate(AT)).toBe("2026-09-23");
  });

  it("a calendar day never moves with the zone", () => {
    const tokyo = formatterFor({ ...resolvePreferences(NO_MEMBER_CHOICES, INDIA), timezone: "Pacific/Kiritimati" });
    expect(tokyo.numericDate("2026-09-23")).toBe("23/09/2026");
    expect(tokyo.date("2026-09-23")).toMatch(/23/);
  });

  it("tells the time in the household's zone, 12- or 24-hour as chosen", () => {
    expect(india.time(AT)).toMatch(/^3:30\s?pm$/i);
    expect(formatterFor(resolvePreferences({ ...NO_MEMBER_CHOICES, timeFormat: "24h" }, INDIA)).time(AT)).toBe("15:30");
    expect(us.time(AT)).toMatch(/^6:00\s?AM$/i);
    expect(india.hourOf(AT)).toBe(15);
  });

  it("writes dates in the person's language", () => {
    const hindi = formatterFor(resolvePreferences({ ...NO_MEMBER_CHOICES, language: "hi" }, INDIA));
    expect(hindi.date("2026-09-23", "full")).toMatch(/सित/);
    expect(hindi.date("2026-09-23", "full")).toMatch(/23/);
  });

  it("formats an amount in its own currency with the region's grouping", () => {
    expect(india.money(125000)).toBe("₹1,25,000");
    expect(india.money(4250.5)).toBe("₹4,250.50");
    expect(us.money(125000)).toBe("$125,000");
    // A record keeps its own currency whatever the household default is.
    expect(india.money(20, "USD")).toMatch(/\$20/);
    expect(india.currencySymbol()).toBe("₹");
  });

  it("keeps digits Latin in every language", () => {
    const marathi = formatterFor(resolvePreferences({ ...NO_MEMBER_CHOICES, language: "mr" }, INDIA));
    expect(marathi.money(1234)).toMatch(/1,234/);
    expect(marathi.number(1234567.89)).toBe("12,34,567.89");
  });

  it("converts measurements only for presentation", () => {
    expect(india.temperature(30)).toBe("30°C");
    expect(us.temperature(30)).toBe("86°F");
    expect(us.weight(1)).toMatch(/2\.2\s?lb/);
    expect(india.weight(1)).toMatch(/1\s?kg/);
  });
});

describe("time zones", () => {
  it("accepts IANA zones and refuses bare offsets", () => {
    expect(isTimezone("Asia/Kolkata")).toBe(true);
    expect(isTimezone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimezone("+05:30")).toBe(false);
    expect(isTimezone("UTC+5")).toBe(false);
    expect(isTimezone("Mars/Olympus")).toBe(false);
  });

  it("describes a zone with its offset for reading", () => {
    expect(describeTimezone("Asia/Kolkata", AT)).toBe("(GMT+05:30) Asia/Kolkata");
  });
});
