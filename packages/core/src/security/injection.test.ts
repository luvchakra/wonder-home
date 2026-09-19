// lint-secrets: fixtures — the credential-shaped strings below are fakes, present precisely to prove they are stripped before anything is logged.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { exportFilename } from "../privacy/export";
import { redact } from "./redact";

/**
 * Injection (story 15-008).
 *
 * Three surfaces, because they are the three this codebase actually has.
 *
 * **SQL.** There is none to inject into: every read and write goes through
 * PostgREST with values passed as values, and no module builds a query by
 * concatenating a string. That is a property worth keeping rather than a fact
 * worth assuming, so it is asserted against the source below.
 *
 * **Response headers.** The export names its file after the household, and a
 * household names itself. A name carrying a quote or a newline would break out
 * of `Content-Disposition` and write headers of its own.
 *
 * **Logs.** A value that is a credential, or that contains one, must not
 * survive into a log line whatever shape it arrives in.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every TypeScript source in the shared package and the app, as text. */
function sources(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const roots = [join(REPO_ROOT, "packages", "core", "src"), join(REPO_ROOT, "apps", "web", "app")];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      found.push({ path: relative(REPO_ROOT, full), text: readFileSync(full, "utf8") });
    }
  };

  for (const root of roots) walk(root);
  return found;
}

describe("there is no SQL to inject into", () => {
  const files = sources();

  it("reads the source at all", () => {
    // A guard on the guard: an empty list would make everything below vacuous.
    expect(files.length).toBeGreaterThan(100);
  });

  it("never builds a query by concatenating a string", () => {
    // `select * from ${table}` in application code is the beginning of every
    // injection story. The migrations are SQL by nature and are not scanned.
    const offenders = files.filter(({ text }) =>
      /(select|insert into|update|delete from)\s[^`'"\n]*\$\{/i.test(text),
    );

    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("never passes a template literal to .rpc()", () => {
    // A definer function called with an interpolated name is the same hole
    // wearing a different hat.
    const offenders = files.filter(({ text }) => /\.rpc\(\s*`/.test(text));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("never interpolates into a PostgREST filter expression", () => {
    // `.or()` and `.filter()` take PostgREST's own comma-and-operator syntax,
    // so a raw value inside one is injectable even though no SQL is written.
    const offenders = files.filter(({ text }) => /\.(or|filter|textSearch)\(\s*`/.test(text));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});

describe("a household cannot write its own response headers", () => {
  const at = new Date("2026-09-19T10:00:00Z");

  it("strips a quote that would close the filename", () => {
    const name = exportFilename('Nair" ; rm -rf /', at);
    expect(name).not.toContain('"');
    expect(name).not.toContain(";");
  });

  it("strips a newline that would start a header of its own", () => {
    // The classic: a name ending a header and beginning Set-Cookie.
    const name = exportFilename("Nair\r\nSet-Cookie: admin=true", at);
    expect(name).not.toContain("\r");
    expect(name).not.toContain("\n");
    expect(name.toLowerCase()).not.toContain("set-cookie:");
  });

  it("strips path traversal", () => {
    const name = exportFilename("../../../etc/passwd", at);
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
  });

  it("only ever produces characters that are safe in a header", () => {
    for (const hostile of ['a"b', "a\nb", "a/b", "a\\b", "日本語", "<script>", "%0d%0a", "!!!", ""]) {
      const name = exportFilename(hostile, at);
      expect(name, hostile).toMatch(/^wonderhome-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/);
    }
  });
});

describe("an injected credential does not survive into a log", () => {
  it("redacts a secret hidden inside an ordinary-looking field", () => {
    const line = redact({
      note: "the household said: here is my key eyJhbGciOiJIUzI1NiJ9.abcdefghijkl.signaturehere",
      detail: "postgresql://user:pw@db.example.com:5432/postgres",
    }) as Record<string, string>;

    expect(line.note).not.toContain("eyJhbGci");
    expect(line.detail).not.toContain("pw@");
  });

  it("redacts by key even when the value looks harmless", () => {
    const line = redact({ api_key: "hunter2", transcript: "we talked about dinner" }) as Record<string, string>;
    expect(line.api_key).toBe("[redacted]");
    expect(line.transcript).toBe("[redacted]");
  });

  it("does not stop at the first level", () => {
    const line = redact({ outer: { inner: { authorization: "Bearer abc.def.ghi" } } }) as Record<
      string,
      Record<string, Record<string, string>>
    >;
    expect(line.outer!.inner!.authorization).toBe("[redacted]");
  });
});
