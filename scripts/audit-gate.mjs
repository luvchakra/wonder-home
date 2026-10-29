#!/usr/bin/env node
/**
 * Dependency gate (docs/security/supply-chain.md).
 *
 *   node scripts/audit-gate.mjs
 *
 * Runs `npm audit --json`. Production advisories of high or critical
 * severity FAIL the run unless their GHSA id is in
 * docs/security/dependency-baseline.json (accepted, with a reason, owner and
 * date). Everything else (dev-only, moderate and below) is reported only.
 * Writes audit.json (the full report) for the artifact upload.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (args) => {
  try {
    return execFileSync("npm", args, { encoding: "utf8", maxBuffer: 64e6 });
  } catch (e) {
    return e.stdout; // npm audit exits non-zero when it finds anything
  }
};

const advisories = (report) =>
  Object.values(report.vulnerabilities ?? {}).flatMap((v) =>
    v.via
      .filter((x) => typeof x === "object")
      .map((x) => ({ pkg: v.name, severity: x.severity, id: x.url.split("/").pop(), title: x.title, fix: v.fixAvailable !== false })),
  );

const prod = JSON.parse(run(["audit", "--omit=dev", "--json"]));
const all = JSON.parse(run(["audit", "--json"]));
writeFileSync("audit.json", JSON.stringify(all, null, 2));

const accepted = new Set(JSON.parse(readFileSync("docs/security/dependency-baseline.json", "utf8")).accepted.map((a) => a.id));
const prodAdvisories = advisories(prod);
const blocking = prodAdvisories.filter((a) => ["high", "critical"].includes(a.severity) && !accepted.has(a.id));
const prodIds = new Set(prodAdvisories.map((a) => a.id));
const reportOnly = advisories(all).filter((a) => !prodIds.has(a.id) || !blocking.includes(a));

console.log(`production advisories: ${prodAdvisories.length} (blocking ${blocking.length}); all dependencies: ${advisories(all).length}`);
for (const a of reportOnly.filter((a) => !blocking.includes(a))) console.log(`  report-only  ${a.severity.padEnd(8)} ${a.pkg} ${a.id}`);
for (const a of blocking) console.log(`  BLOCKING     ${a.severity.padEnd(8)} ${a.pkg} ${a.id} ${a.title} (fix ${a.fix ? "available" : "none"})`);
process.exit(blocking.length ? 1 : 0);
