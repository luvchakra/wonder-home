import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "./env";

const VALID_URL = "https://stehegovxlssxdepiruk.supabase.co";
const VALID_KEY = "sb_publishable_0123456789abcdef";

describe("environment contract", () => {
  it("accepts a complete public configuration", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    });
  });

  it("names the missing variable and where to set it", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: VALID_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY[\s\S]*\.env\.example/);
  });

  it("rejects a URL that is not absolute", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "stehegovxlssxdepiruk.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
      }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a truncated key rather than failing later at request time", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: VALID_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "short" }),
    ).toThrowError(/too short/);
  });

  it("validates server-only configuration separately from public configuration", () => {
    expect(() => parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: VALID_KEY })).toEqual({
      SUPABASE_SERVICE_ROLE_KEY: VALID_KEY,
    });
  });
});
