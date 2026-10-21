import { describe, expect, it } from "vitest";

import { AI_CRAWLERS, apiDocsNeedSession, LINK_PREVIEW_FETCHERS, robotsRules } from "./exposure";

describe("what crawlers and anonymous callers may read", () => {
  const rules = robotsRules();
  const ruleFor = (agent: string) => rules.find((rule) => (Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]).includes(agent));

  it("refuses every known AI crawler the whole site", () => {
    for (const agent of ["GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "PerplexityBot", "Google-Extended", "Bytespider", "meta-externalagent", "Diffbot"]) {
      expect(AI_CRAWLERS).toContain(agent);
      expect(ruleFor(agent)).toEqual(expect.objectContaining({ disallow: ["/"] }));
      expect(ruleFor(agent)?.allow).toBeUndefined();
    }
  });

  it("lets search engines read the landing and legal pages, and nothing behind sign-in", () => {
    const everyone = ruleFor("*")!;
    expect(everyone.allow).toEqual(expect.arrayContaining(["/$", "/legal$"]));
    expect(everyone.disallow).toEqual(["/", "/careers/status"]);
    expect(everyone.allow).not.toContain("/e/");
  });

  it("lets search engines read the careers list and each job, never an applicant's status page", () => {
    for (const agent of ["*", "facebookexternalhit"]) {
      const rule = ruleFor(agent)!;
      expect(rule.allow).toEqual(expect.arrayContaining(["/careers$", "/careers/"]));
      // The longer rule wins in robots.txt, so the status page stays out.
      expect(rule.disallow).toContain("/careers/status");
    }
  });

  it("lets chat link previews unfurl an event's invite link, which is sent over WhatsApp on purpose", () => {
    expect(LINK_PREVIEW_FETCHERS).toContain("WhatsApp");
    expect(ruleFor("facebookexternalhit")?.allow).toContain("/e/");
    // A link preview is not an AI crawler, and an AI crawler is never a link preview.
    expect(LINK_PREVIEW_FETCHERS.some((agent) => (AI_CRAWLERS as readonly string[]).includes(agent))).toBe(false);
  });

  it("keeps the API's description for members in production only", () => {
    expect(apiDocsNeedSession({ VERCEL_ENV: "production" })).toBe(true);
    expect(apiDocsNeedSession({ VERCEL_ENV: "preview" })).toBe(false);
    expect(apiDocsNeedSession({})).toBe(false);
  });
});
