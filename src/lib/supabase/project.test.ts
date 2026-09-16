import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WONDERHOME_PROJECT_REF,
  WONDERHOME_SUPABASE_URL,
  WrongSupabaseProjectError,
  assertWonderHomeKey,
  assertWonderHomeUrl,
  projectRefFromKey,
  projectRefFromUrl,
} from "./project.ts";

/** Builds an unsigned JWT-shaped key carrying the given project ref. */
function jwtForRef(ref: string): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: "supabase",
    ref,
    role: "anon",
  })}.signature`;
}

const OTHER_REF = "abcdefghijklmnopqrst";

describe("projectRefFromUrl", () => {
  it("reads the ref from an API URL", () => {
    assert.equal(
      projectRefFromUrl(WONDERHOME_SUPABASE_URL),
      WONDERHOME_PROJECT_REF,
    );
  });

  it("reads the ref from a direct database host", () => {
    assert.equal(
      projectRefFromUrl(`https://db.${WONDERHOME_PROJECT_REF}.supabase.co`),
      WONDERHOME_PROJECT_REF,
    );
  });

  it("returns null for non-Supabase and malformed hosts", () => {
    assert.equal(projectRefFromUrl("https://example.com"), null);
    assert.equal(projectRefFromUrl("https://evil.supabase.co.attacker.net"), null);
    assert.equal(projectRefFromUrl("not a url"), null);
  });
});

describe("assertWonderHomeUrl", () => {
  it("accepts the pinned project URL", () => {
    assert.equal(
      assertWonderHomeUrl(WONDERHOME_SUPABASE_URL, "test"),
      WONDERHOME_SUPABASE_URL,
    );
  });

  it("rejects another Supabase project", () => {
    assert.throws(
      () => assertWonderHomeUrl(`https://${OTHER_REF}.supabase.co`, "test"),
      WrongSupabaseProjectError,
    );
  });

  it("rejects a non-Supabase host", () => {
    assert.throws(
      () => assertWonderHomeUrl("https://db.example.com", "test"),
      WrongSupabaseProjectError,
    );
  });
});

describe("projectRefFromKey", () => {
  it("reads the ref out of a legacy JWT key", () => {
    assert.equal(projectRefFromKey(jwtForRef(OTHER_REF)), OTHER_REF);
  });

  it("returns null for opaque sb_ keys, which carry no ref", () => {
    assert.equal(projectRefFromKey("sb_publishable_abc123"), null);
    assert.equal(projectRefFromKey("sb_secret_abc123"), null);
  });
});

describe("assertWonderHomeKey", () => {
  it("accepts a JWT key issued for the pinned project", () => {
    const key = jwtForRef(WONDERHOME_PROJECT_REF);
    assert.equal(assertWonderHomeKey(key, "test"), key);
  });

  it("rejects a JWT key issued for another project", () => {
    assert.throws(
      () => assertWonderHomeKey(jwtForRef(OTHER_REF), "test"),
      WrongSupabaseProjectError,
    );
  });

  it("accepts opaque keys, which cannot be attributed to a project", () => {
    assert.equal(
      assertWonderHomeKey("sb_publishable_abc123", "test"),
      "sb_publishable_abc123",
    );
  });
});
