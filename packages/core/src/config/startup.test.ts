import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLogSink, type LogRecord } from "../observability/logger";
import { assertConfiguration } from "./startup";

const VALID_URL = "https://kqxndableyysxqhxiorz.supabase.co";
const VALID_KEY = "sb_publishable_0123456789abcdef";

const ORIGINAL = { ...process.env };
let records: LogRecord[] = [];

beforeEach(() => {
  records = [];
  setLogSink((record) => records.push(record));
  process.env.NEXT_PUBLIC_SUPABASE_URL = VALID_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = VALID_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.WONDERHOME_FLAG_VOICE_CONVERSATION;
});

afterEach(() => {
  setLogSink(null);
  process.env = { ...ORIGINAL };
});

describe("startup configuration", () => {
  it("passes on a complete public configuration and logs which flags resolved", () => {
    expect(() => assertConfiguration("public")).not.toThrow();
    expect(records[0]).toMatchObject({ message: "configuration validated", scope: "public" });
    expect(records[0]?.flags).toMatchObject({ voice_conversation: false });
  });

  it("does not require the service-role key for a public deployment", () => {
    expect(() => assertConfiguration("public")).not.toThrow();
  });

  it("requires the service-role key only in the privileged scope", () => {
    expect(() => assertConfiguration("privileged")).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("reports a missing public value and a bad flag together, not one at a time", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.WONDERHOME_FLAG_VOICE_CONVERSATION = "perhaps";

    try {
      assertConfiguration("public");
      throw new Error("expected assertConfiguration to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
      expect(message).toMatch(/WONDERHOME_FLAG_VOICE_CONVERSATION/);
    }
  });

  it("never logs a configuration value", () => {
    assertConfiguration("public");
    expect(JSON.stringify(records)).not.toContain(VALID_KEY);
  });
});
