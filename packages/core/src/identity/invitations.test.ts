import { describe, expect, it } from "vitest";

import {
  INVITATION_TTL_DAYS,
  generateInvitationToken,
  hashInvitationToken,
} from "./invitations";

describe("invitation tokens", () => {
  it("generates a URL-safe token with no padding", () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
  });

  it("generates enough entropy that guessing is not a threat", () => {
    // 32 bytes base64url-encoded, padding stripped.
    expect(generateInvitationToken().length).toBeGreaterThanOrEqual(43);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateInvitationToken));
    expect(tokens.size).toBe(200);
  });

  it("hashes to a stable SHA-256 digest", async () => {
    const first = await hashInvitationToken("a-known-token-value");
    const second = await hashInvitationToken("a-known-token-value");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a digest that does not reveal the token", async () => {
    const token = generateInvitationToken();
    const digest = await hashInvitationToken(token);
    expect(digest).not.toContain(token);
    expect(digest).not.toBe(token);
  });

  it("gives different tokens different digests", async () => {
    const [a, b] = [generateInvitationToken(), generateInvitationToken()];
    expect(await hashInvitationToken(a)).not.toBe(await hashInvitationToken(b));
  });

  it("expires invitations rather than leaving links working forever", () => {
    expect(INVITATION_TTL_DAYS).toBeGreaterThan(0);
    expect(INVITATION_TTL_DAYS).toBeLessThanOrEqual(14);
  });
});
