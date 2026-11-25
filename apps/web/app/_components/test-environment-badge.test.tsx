import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TestEnvironmentBadge } from "./test-environment-badge";

describe("TEST badge", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows TEST on the test environment", () => {
    vi.stubEnv("WONDERHOME_ENV", "test");
    expect(renderToStaticMarkup(<TestEnvironmentBadge />)).toContain(">TEST<");
  });

  it("shows nothing in production", () => {
    vi.stubEnv("WONDERHOME_ENV", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(renderToStaticMarkup(<TestEnvironmentBadge />)).toBe("");
  });
});
