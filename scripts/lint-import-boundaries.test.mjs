import assert from "node:assert/strict";
import { test } from "node:test";

import { lintImports } from "./lint-import-boundaries.mjs";

test("accepts an app importing a declared core export", () => {
  const source = `import { AppShell } from "@wonderhome/core/shell/app-shell";`;
  assert.deepEqual(lintImports("apps/web/app/page.tsx", source), []);
});

test("rejects an app reaching into packages/ relatively", () => {
  const source = `import { cn } from "../../../packages/core/src/lib/cn";`;
  const problems = lintImports("apps/web/app/page.tsx", source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not a relative path into packages/);
});

test("rejects an app importing a package's /src internals", () => {
  const source = `import { cn } from "@wonderhome/core/src/lib/cn";`;
  const problems = lintImports("apps/web/app/page.tsx", source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not its \/src internals/);
});

test("rejects a package depending on an app", () => {
  const source = `import { thing } from "../../apps/web/lib/thing";`;
  const problems = lintImports("packages/core/src/lib/x.ts", source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /must not depend on an app/);
});

test("rejects reaching past another module's contract entry point", () => {
  const source = `import { plan } from "@wonderhome/module-meals/internal/planner";`;
  const problems = lintImports("packages/module-groceries/src/x.ts", source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /only through its contract entry point/);
});

test("allows a module's contract entry point", () => {
  const source = `import { plan } from "@wonderhome/module-meals/contract";`;
  assert.deepEqual(lintImports("packages/module-groceries/src/x.ts", source), []);
});

test("allows core imports from a module package", () => {
  const source = `import { cn } from "@wonderhome/core/lib/cn";`;
  assert.deepEqual(lintImports("packages/module-meals/src/x.ts", source), []);
});

test("checks dynamic imports too", () => {
  const source = `const mod = await import("@wonderhome/core/src/lib/cn");`;
  const problems = lintImports("apps/web/app/page.tsx", source);
  assert.equal(problems.length, 1);
});
