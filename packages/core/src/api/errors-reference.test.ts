import { describe, expect, it, vi } from "vitest";

import { ApiError, toErrorBody } from "./errors";

describe("an unexpected error's reference", () => {
  it("is said in the message and logged beside the error, even when a screen passed only its area", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status, body } = toErrorBody(new Error("createObligation failed: 23514"), "finance");
    expect(status).toBe(500);
    expect(body.error.requestId).toMatch(/^finance-[a-z0-9]{1,6}$/);
    expect(body.error.message).toContain(`(reference ${body.error.requestId})`);
    expect(log).toHaveBeenCalledWith(`[${body.error.requestId}]`, "createObligation failed: 23514");
    log.mockRestore();
  });

  it("keeps a real request id, and a known error's own words", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toErrorBody(new Error("x"), "req-1234abcd").body.error.requestId).toBe("req-1234abcd");
    expect(toErrorBody(ApiError.badRequest("Add a name."), "finance").body.error.message).toBe("Add a name.");
  });
});
