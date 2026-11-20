import { describe, expect, it } from "vitest";

import { cleanRazorpayKeyId, cleanRazorpayKeySecret } from "./razorpay-keys";
import { settingDefinition, validateSetting } from "./registry";

const SECRET = "TestOnlyRazorpaySecret24"; // 24 letters and numbers, the shape Razorpay issues

describe("Razorpay keys as pasted", () => {
  it("take a test or live key id, with pasted spaces and line breaks dropped", () => {
    expect(cleanRazorpayKeyId("  rzp_test_AbC123xyz987Q\n")).toEqual({ ok: true, value: "rzp_test_AbC123xyz987Q" });
    expect(cleanRazorpayKeyId("rzp_live_AbC123xyz987Q ")).toEqual({ ok: true, value: "rzp_live_AbC123xyz987Q" });
  });

  it("name the mix-up when the secret goes in the key id box, and the other way round", () => {
    expect(cleanRazorpayKeyId(SECRET)).toMatchObject({ ok: false, message: expect.stringContaining("looks like the Key Secret") });
    expect(cleanRazorpayKeySecret("rzp_test_AbC123xyz987Q")).toMatchObject({ ok: false, message: expect.stringContaining("That's the key id") });
  });

  it("take a 24-character secret with surrounding whitespace, and say plainly what a bad one lacks", () => {
    expect(cleanRazorpayKeySecret(`\t${SECRET}\r\n`)).toEqual({ ok: true, value: SECRET });
    expect(cleanRazorpayKeySecret("short1")).toEqual({ ok: false, message: "A Razorpay key secret is 24 letters and numbers, with no spaces or symbols." });
    expect(cleanRazorpayKeySecret("abc$def!ghi#jkl%mno^pqr")).toMatchObject({ ok: false });
  });

  it("are what the registry saves, with the cleaner's sentence as the message", () => {
    const secret = settingDefinition("RAZORPAY_KEY_SECRET")!;
    const id = settingDefinition("RAZORPAY_KEY_ID")!;
    expect(validateSetting(secret, ` ${SECRET}\n`)).toEqual({ ok: true, value: SECRET });
    expect(validateSetting(id, " rzp_test_AbC123xyz987Q ")).toEqual({ ok: true, value: "rzp_test_AbC123xyz987Q" });
    expect(validateSetting(secret, "nope")).toEqual({ ok: false, message: "A Razorpay key secret is 24 letters and numbers, with no spaces or symbols." });
  });
});
