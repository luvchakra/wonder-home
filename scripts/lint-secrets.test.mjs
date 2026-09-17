// lint-secrets: fixtures — this file exists to test credential detection.
import assert from "node:assert/strict";
import { test } from "node:test";

import { lintSecretSource } from "./lint-secrets.mjs";

test("accepts ordinary source", () => {
  assert.deepEqual(lintSecretSource("a.ts", `const url = process.env.NEXT_PUBLIC_SUPABASE_URL;`), []);
});

test("catches a committed Supabase secret key", () => {
  const problems = lintSecretSource("a.ts", `const key = "sb_secret_abcdefghijklmnop";`);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Supabase secret key/);
});

test("catches a JWT pasted into source", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJhYmNkZWZnIn0.c2lnbmF0dXJlLXZhbHVl";
  assert.match(lintSecretSource("a.ts", `const t = "${jwt}";`)[0], /JWT/);
});

test("catches a connection string carrying a password", () => {
  const problems = lintSecretSource("a.ts", `const dsn = "postgresql://user:hunter2@db:5432/app";`);
  assert.match(problems[0], /connection string/);
});

test("catches a private key block", () => {
  assert.match(
    lintSecretSource("a.pem", "-----BEGIN PRIVATE KEY-----")[0],
    /Private key block/,
  );
});

test("catches a server-only value exposed through NEXT_PUBLIC_", () => {
  const problems = lintSecretSource(".env", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ships it to the browser/);
});

test("allows a value that announces itself as a placeholder", () => {
  assert.deepEqual(
    lintSecretSource("src/config.ts", `const key = "sb_secret_placeholder_value";`),
    [],
  );
});

test("does not excuse a real key because the line mentions an example", () => {
  const problems = lintSecretSource(
    "src/config.ts",
    `const key = "sb_secret_9f2b1c4d7e8a"; // see the example in the docs`,
  );
  assert.equal(problems.length, 1, "a credential was excused by a nearby word");
});

test("does not allow a real-looking key just because the filename says example", () => {
  const problems = lintSecretSource(".env.example", `SUPABASE_SERVICE_ROLE_KEY=sb_secret_9f2b1c4d7e8a`);
  assert.equal(problems.length, 1, "a credential-shaped literal was allowed by filename");
});

test("honours an explicit fixture marker, and only an explicit one", () => {
  const key = `const k = "sb_secret_abcdefghijklmnop";`;
  assert.equal(lintSecretSource("a.test.ts", key).length, 1);
  assert.deepEqual(lintSecretSource("a.test.ts", `// lint-secrets: fixtures\n${key}`), []);
});
