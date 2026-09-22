import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Domain surface smoke tests.
 *
 * The specs beside this one check a fixed list of endpoints. Every module since
 * has added routes, and a fixed list silently stops covering them — so this file
 * derives the list from the route files on disk. A new endpoint is covered the
 * moment it exists, and an endpoint that forgets its authorization or its
 * documentation fails here rather than in production.
 */

const API_ROOT = join(process.cwd(), "apps/web/app/api/v1");

/** Every `/api/v1` path the app actually serves, as an OpenAPI-style template. */
function servedPaths(directory = API_ROOT, prefix = ""): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const child = join(directory, entry);

    if (entry === "route.ts") {
      found.push(prefix === "" ? "/" : prefix);
      continue;
    }
    if (statSync(child).isDirectory()) {
      const segment = entry.startsWith("[") ? `{${entry.slice(1, -1)}}` : entry;
      found.push(...servedPaths(child, `${prefix}/${segment}`));
    }
  }

  return found;
}

/** A path template with its parameters filled in, so it can be requested. */
const PLACEHOLDER: Record<string, string> = {
  "{householdId}": "00000000-0000-4000-8000-000000000000",
  "{memberId}": "00000000-0000-4000-8000-000000000001",
  "{invitationId}": "00000000-0000-4000-8000-000000000002",
};

function requestable(template: string): string {
  return template.replace(/\{[^}]+\}/g, (parameter) => PLACEHOLDER[parameter] ?? "unknown");
}

// `/intake/share` is the PWA Web Share Target's landing point — reachable
// from the OS share sheet whether or not the person has ever signed in on
// this device (that is the whole point of the signed-out handoff), so it is
// deliberately not held to the "anonymous caller gets 401" shape the rest of
// `/api/v1` is: it always ends in a redirect, never the standard JSON error
// envelope.
const PUBLIC_PATHS = new Set(["/health", "/health/ready", "/openapi", "/intake/share"]);

const SERVED = servedPaths().sort();
const GUARDED = SERVED.filter((path) => !PUBLIC_PATHS.has(path));

test("the app serves the endpoints these tests expect to find", () => {
  // A guard on the guard: if the route layout moves, the loops below would
  // quietly pass over nothing at all.
  expect(SERVED.length).toBeGreaterThan(15);
  expect(SERVED).toContain("/households/{householdId}/bills");
});

test("every endpoint the app serves is described in the OpenAPI document", async ({ request }) => {
  const document = await (await request.get("/api/v1/openapi")).json();
  const documented = new Set(Object.keys(document.paths));

  const undocumented = SERVED.filter((path) => !documented.has(path));
  expect(undocumented, "endpoints exist that the API does not describe").toEqual([]);
});

test("the OpenAPI document describes nothing the app does not serve", async ({ request }) => {
  const document = await (await request.get("/api/v1/openapi")).json();
  const served = new Set(SERVED);

  const phantom = Object.keys(document.paths).filter((path) => !served.has(path));
  expect(phantom, "the API describes endpoints that do not exist").toEqual([]);
});

for (const path of GUARDED) {
  test(`GET ${path} refuses an anonymous caller in the standard envelope`, async ({ request }) => {
    const response = await request.get(`/api/v1${requestable(path)}`);

    // 405 is a legitimate answer from a write-only endpoint; anything else that
    // is not 401 means an anonymous caller got further than they should.
    if (response.status() === 405) return;

    expect(response.status(), `${path} let an anonymous caller through`).toBe(401);

    const payload = await response.json();
    expect(payload.error.code).toBe("unauthenticated");
    expect(payload.error.requestId).toBeTruthy();
    expect(payload.error).not.toHaveProperty("stack");
  });
}

for (const path of GUARDED) {
  test(`POST ${path} refuses an anonymous caller before reading the body`, async ({ request }) => {
    const response = await request.post(`/api/v1${requestable(path)}`, {
      data: { anything: "an anonymous caller should never get as far as validation" },
    });

    if (response.status() === 405) return;

    expect(response.status(), `${path} accepted an anonymous write`).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
  });
}

test("a refusal never says whether the household exists", async ({ request }) => {
  // Two household ids, one plausible and one not. Both anonymous, so both must
  // read identically: a different answer would confirm a household by probing.
  const real = await request.get(`/api/v1/households/${PLACEHOLDER["{householdId}"]}/bills`);
  const invented = await request.get("/api/v1/households/11111111-1111-4111-8111-111111111111/bills");

  expect(real.status()).toBe(invented.status());
  expect((await real.json()).error.code).toBe((await invented.json()).error.code);
});

test("no domain endpoint leaks household content to an anonymous caller", async ({ request }) => {
  for (const path of GUARDED) {
    const body = await (await request.get(`/api/v1${requestable(path)}`)).text();

    expect(body, `${path} returned something that looks like household data`).not.toMatch(
      /chakraborty|@example|amount_minor|display_name|token_hash/i,
    );
  }
});
