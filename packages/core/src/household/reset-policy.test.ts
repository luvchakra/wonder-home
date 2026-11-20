import { describe, expect, it } from "vitest";

import { TOOLS } from "../ai/tools";
import { INTENT_ACTIONS } from "../conversation/intent";
import { GEMINI_LIVE_TOOL_NAMES } from "../voicelink/gemini-live";
import { VOICE_CAPABILITIES } from "../voicelink/capabilities";
import { confirmsHomeName, isHouseholdOwner, mayDownloadOwnData, mayResetHome, RESET_CHANNELS } from "./reset-policy";

const household = { id: "h-1", ownerMemberId: "m-owner" };
const owner = { memberId: "m-owner", memberType: "adult" as const, roles: ["head" as const], household };
const otherAdmin = { memberId: "m-admin", memberType: "adult" as const, roles: ["administrator" as const], household };
const adult = { memberId: "m-adult", memberType: "adult" as const, roles: ["adult" as const], household };
const child = { memberId: "m-child", memberType: "child" as const, roles: ["child" as const], household };
const helper = { memberId: "m-helper", memberType: "helper" as const, roles: ["helper" as const], household };
const otherOwner = { memberId: "m-x", memberType: "adult" as const, roles: ["head" as const], household: { id: "h-2", ownerMemberId: "m-x" } };

describe("mayResetHome (story 15-014)", () => {
  it("lets the owner reset their own home, in the app", () => {
    expect(mayResetHome(owner, "app")).toEqual({ ok: true });
    expect(isHouseholdOwner(owner)).toBe(true);
  });

  it("refuses another Admin, an adult, a child and a helper", () => {
    expect(mayResetHome(otherAdmin, "app")).toEqual({ ok: false, code: "not_owner" });
    expect(mayResetHome(adult, "app")).toEqual({ ok: false, code: "not_owner" });
    expect(mayResetHome(child, "app")).toEqual({ ok: false, code: "not_adult" });
    expect(mayResetHome(helper, "app")).toEqual({ ok: false, code: "not_adult" });
    expect(isHouseholdOwner(otherAdmin)).toBe(false);
  });

  it("refuses another household's owner pointed at this home", () => {
    expect(mayResetHome(otherOwner, "app", "h-1")).toEqual({ ok: false, code: "not_owner" });
  });

  it("refuses a household with no owner on record", () => {
    expect(mayResetHome({ ...owner, household: { id: "h-1", ownerMemberId: null } }, "app")).toEqual({ ok: false, code: "not_owner" });
  });

  it("never from HomeTalk, voice, WhatsApp or an agent, even for the owner", () => {
    for (const channel of RESET_CHANNELS.filter((c) => c !== "app")) {
      expect(mayResetHome(owner, channel)).toEqual({ ok: false, code: "not_in_app" });
    }
  });

  it("has no HomeTalk intent, agent tool, Gemini tool or voice capability that resets or wipes a home", () => {
    const destructive = /reset|wipe|erase|delete_household|household\.delete|remove_all|purge/i;
    expect(INTENT_ACTIONS.filter((action) => destructive.test(action))).toEqual([]);
    expect(TOOLS.map((tool) => tool.name).filter((name) => destructive.test(name))).toEqual([]);
    expect(GEMINI_LIVE_TOOL_NAMES.filter((name) => destructive.test(name))).toEqual([]);
    expect(VOICE_CAPABILITIES.map((capability) => capability.id).filter((id) => destructive.test(id))).toEqual([]);
  });
});

describe("mayDownloadOwnData (owner, 2026-11-20: everyone downloads)", () => {
  it("lets every adult download, Admin or not, and a helper", () => {
    for (const who of [owner, otherAdmin, adult, helper]) expect(mayDownloadOwnData(who, "app")).toEqual({ ok: true });
  });

  it("never a child", () => {
    expect(mayDownloadOwnData(child, "app")).toEqual({ ok: false, code: "child" });
  });

  it("never for another household", () => {
    expect(mayDownloadOwnData(otherOwner, "app", "h-1")).toEqual({ ok: false, code: "other_household" });
  });

  it("never by voice, HomeTalk, WhatsApp or an agent", () => {
    for (const channel of RESET_CHANNELS.filter((c) => c !== "app")) expect(mayDownloadOwnData(adult, channel)).toEqual({ ok: false, code: "not_in_app" });
  });
});

describe("confirmsHomeName", () => {
  it("matches the home's name, ignoring case and outer spaces", () => {
    expect(confirmsHomeName("  sharma home ", "Sharma Home")).toBe(true);
    expect(confirmsHomeName("Sharma", "Sharma Home")).toBe(false);
    expect(confirmsHomeName("", "")).toBe(false);
  });
});
