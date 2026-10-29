import { beforeEach, describe, expect, it } from "vitest";

import { setLogSink } from "../observability/logger";
import { recordCspReports, resetCspReportBudget, summariseCspReports } from "./csp-report";

const legacy = { "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/a.js?token=SECRET", "document-uri": "https://home.wonderapps.biz/family?code=SECRET#x", disposition: "report", "script-sample": "alert(1)" } };

describe("CSP report intake", () => {
  const lines: Record<string, unknown>[] = [];
  beforeEach(() => {
    lines.length = 0;
    resetCspReportBudget();
    setLogSink((r) => lines.push(r));
  });

  it("keeps the rule hit, the blocked origin and the page path, nothing else", () => {
    expect(summariseCspReports(legacy)).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example", page: "/family", disposition: "report" }]);
    const reporting = [{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "inline", documentURL: "https://h/e/aaaaaaaaaaaaaaaaaaaaaaaa" } }];
    expect(summariseCspReports(reporting)[0]).toMatchObject({ directive: "img-src", blocked: "inline", page: "/e/:id" });
  });

  it("logs nothing sensitive and stays within its budget", () => {
    for (let i = 0; i < 50; i++) recordCspReports(legacy, 1000);
    expect(lines.filter((l) => l.message === "csp violation")).toHaveLength(20);
    expect(JSON.stringify(lines)).not.toMatch(/SECRET|alert/);
  });

  it("ignores junk", () => {
    expect(recordCspReports("nope")).toBe(0);
    expect(recordCspReports({ a: 1 })).toBe(0);
  });
});
