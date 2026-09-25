import assert from "node:assert/strict";
import { test } from "node:test";

import { bar, parseBacklog, renderProgress, tally } from "./build-progress.mjs";

const BACKLOG = `# WonderHome — External Integrations

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 17-001 | Connector framework | Done | one contract |
| 2 | P0 | 17-002 | Calendar | Done | |
| 3 | P0 | 17-003 | Email | Not Started | |

## Stories

### Story 17-001 — Connector framework
**Priority:** P0
`;

test("reads the module title and every tracking row", () => {
  const module = parseBacklog("17-External-Integrations.md", BACKLOG);

  assert.equal(module.number, "17");
  assert.equal(module.title, "External Integrations");
  assert.equal(module.stories.length, 3);
  assert.deepEqual(module.stories[0], {
    index: 1,
    priority: "P0",
    id: "17-001",
    title: "Connector framework",
    status: "Done",
    notes: "one contract",
  });
});

test("does not double-count the prose that repeats each story below the table", () => {
  // "### Story 17-001 — Connector framework" also carries an id, and counting
  // it would report twice as many stories as the backlog has.
  const module = parseBacklog("17-External-Integrations.md", BACKLOG);
  assert.equal(module.stories.filter((story) => story.id === "17-001").length, 1);
});

test("counts by status", () => {
  const { stories } = parseBacklog("17-External-Integrations.md", BACKLOG);
  assert.deepEqual(tally(stories), { Done: 2, "In Progress": 0, Blocked: 0, "Not Started": 1, Deferred: 0 });
});

test("the bar is only full when every story is done", () => {
  assert.equal(bar(10, 10), "██████████");
  // 9 of 10 is 90%, which must not round up to a finished module.
  assert.notEqual(bar(9, 10), "██████████");
  assert.equal(bar(0, 10), "░░░░░░░░░░");
});

test("renders the outstanding work as its own section", () => {
  const output = renderProgress([parseBacklog("17-External-Integrations.md", BACKLOG)]);

  assert.match(output, /## What is left/);
  assert.match(output, /`17-003` Email/);
  // A finished story has no business in the list of what is left.
  assert.doesNotMatch(output.split("## Every story")[0], /`17-001`/);
});

test("reports the overall count and percentage", () => {
  const output = renderProgress([parseBacklog("17-External-Integrations.md", BACKLOG)]);
  assert.match(output, /\*\*2 of 3 stories done — 66\.7%\*\*/);
});

test("says plainly when nothing is left", () => {
  const finished = BACKLOG.replace("Not Started", "Done");
  const output = renderProgress([parseBacklog("17-External-Integrations.md", finished)]);

  assert.match(output, /Every story in every backlog is done\./);
});
