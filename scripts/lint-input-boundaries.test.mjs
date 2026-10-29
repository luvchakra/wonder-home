import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeActions, analyzeRoute, tally, violations } from "./lint-input-boundaries.mjs";

const route = (name, source) => analyzeRoute(`apps/web/app/api/v1/${name}/route.ts`, source);

test("a handler that reads a body with no schema is flagged", () => {
  const [item] = route("x", `export async function POST(request: Request) { const body = await request.json(); return Response.json(body); }`);
  assert.equal(item.status, "not-validated");
  assert.match(violations([item], {})[0], /no schema parse/);
});

test("a handler that safeParses its body passes", () => {
  const [item] = route("x", `export async function POST(request: Request) { const body = schema.safeParse(await request.json()); return Response.json(body); }`);
  assert.equal(item.status, "validated");
  assert.deepEqual(violations([item], {}), []);
});

test("defineRoute with an input schema counts as validated", () => {
  const [item] = route("x", `export const POST = defineRoute({ input: schema }, async ({ body }) => body);`);
  assert.equal(item.status, "validated");
});

test("an unparsed query string is flagged; parseQuery clears it", () => {
  const [bad] = route("x", `export async function GET(request: Request) { const n = new URL(request.url).searchParams.get("n"); return Response.json(n); }`);
  assert.equal(bad.status, "not-validated");
  const [good] = route("x", `export async function GET(request: Request) { const q = parseQuery(request, schema); return Response.json(q); }`);
  assert.equal(good.status, "validated");
});

test("a GET with no input needs nothing", () => {
  const [item] = route("x", `export async function GET() { return Response.json({ ok: true }); }`);
  assert.equal(item.status, "no-input");
});

test("a 'use server' action with an argument and no schema is flagged; formUuid clears it", () => {
  const bad = analyzeActions("a/actions.ts", `"use server";\nexport async function save(_p: S, formData: FormData) { return String(formData.get("x")); }`);
  assert.equal(bad[0].status, "not-validated");
  const good = analyzeActions("a/actions.ts", `"use server";\nexport async function save(_p: S, formData: FormData) { const id = formUuid(formData, "id"); return id; }`);
  assert.equal(good[0].status, "validated");
});

test("a helper in the same file that validates counts", () => {
  const source = `"use server";\nfunction read(formData: FormData) { return schema.safeParse(Object.fromEntries(formData)); }\nexport async function save(_p: S, formData: FormData) { return read(formData); }`;
  assert.equal(analyzeActions("a/actions.ts", source)[0].status, "validated");
});

test("a file without 'use server' has no actions", () => {
  assert.deepEqual(analyzeActions("a/lib.ts", `export async function save(formData: FormData) { return 1; }`), []);
});

test("a baselined handler passes; a stale or reasonless entry fails", () => {
  const [item] = route("x", `export async function POST(request: Request) { return Response.json(await request.json()); }`);
  assert.deepEqual(violations([item], { [item.id]: { reason: "r", story: "SEC-03b" } }), []);
  assert.match(violations([item], { [item.id]: { reason: "r" } })[0], /needs a "reason" and a "story"/);
  assert.match(violations([], { gone: { reason: "r", story: "s" } })[0], /stale/);
});

test("tally counts per kind", () => {
  const t = tally(route("x", `export async function GET() { return 1; }`));
  assert.equal(t.route.total, 1);
});
