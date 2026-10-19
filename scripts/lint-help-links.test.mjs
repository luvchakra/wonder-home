import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { sentinels } from "./check-client-bundle.mjs";
import { appRoutes, check, guideShape, isRoute, pageAnchors, pathsIn } from "./lint-help-links.mjs";

const routes = [[], ["help"], ["settings", "plan"], ["household", "[id]"], ["certification"]];
const sections = new Set(["privacy", "plan"]);

test("routes match by segment, with dynamic segments matching anything", () => {
  assert.equal(isRoute("/settings/plan", routes), true);
  assert.equal(isRoute("/household/abc", routes), true);
  assert.equal(isRoute("/settings/gone", routes), false);
  assert.equal(isRoute("/", routes), true);
});

test("paths are read from string literals, with their anchors", () => {
  assert.deepEqual(pathsIn('href="/help#privacy" and `/settings/plan` but not a/b or 3/4'), [
    { path: "/help", anchor: "privacy" },
    { path: "/settings/plan", anchor: undefined },
  ]);
});

test("a help file linking to a page that does not exist fails", () => {
  const problems = check({ routes, sections, faqTargets: [], helpFiles: [{ file: "help/page.tsx", text: 'href="/settings/gone"' }], otherFiles: [] });
  assert.deepEqual(problems, ["help/page.tsx: /settings/gone is not a page the app serves"]);
});

test("an anchor into the guide that is not a section fails, wherever it is", () => {
  const problems = check({
    routes,
    sections,
    faqTargets: [{ id: "x", section: "gone" }],
    helpFiles: [{ file: "help/page.tsx", text: 'href="/help#plan"' }],
    otherFiles: [{ file: "conversation/reply.ts", text: 'link("/help#nowhere")' }],
  });
  assert.deepEqual(problems, [
    "conversation/reply.ts: /help#nowhere is not a guide section",
    'guide.ts: FAQ "x" reads more at #gone, which is not a guide section',
  ]);
});

test("the real guide's shape is read, and the real app serves the help page's own links", () => {
  const { sections: real, faqTargets } = guideShape(readFileSync(new URL("../packages/core/src/help/guide.ts", import.meta.url), "utf8"));
  assert.ok(real.has("privacy") && real.size >= 20);
  assert.ok(faqTargets.length >= 10);
  const page = readFileSync(new URL("../apps/web/app/help/page.tsx", import.meta.url), "utf8");
  const found = pathsIn(page).map((entry) => entry.path);
  assert.ok(found.includes("/certification") && found.includes("/ai"), `found ${found.join(", ")}`);
  const served = appRoutes(new URL("../apps/web/app", import.meta.url).pathname);
  for (const path of found) assert.equal(isRoute(path, served), true, path);
  assert.ok(pageAnchors(page).includes("release-notes"));
});

test("the bundle check's sentinels skip phrases the app's own screens also say", () => {
  const help = `"help.guide.x.summary": "A photo, a PDF, a voice note, a link or a forward, read and confirmed by you here.",`;
  assert.equal(sentinels(help).length, 1);
  assert.equal(sentinels(help, "Drop it here: A photo, a PDF, a voice note, a link or a forward, read and confirmed by you here.").length, 0);
});
