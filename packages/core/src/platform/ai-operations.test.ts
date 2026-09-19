import { describe, expect, it } from "vitest";

import { platformCan, type PlatformAdmin } from "./admin";
import { agentRunDetail, aiOperationsSummary, listFailedAgentRuns } from "./ai-operations";

/**
 * AI operations monitoring (story 16-006).
 *
 * The schema (`agent_runs`, `agent_tool_calls`) already guarantees no raw
 * prompt or household content is stored — that is proven by the migration
 * comment and by module 14's own coverage. What belongs here is this
 * module's own contribution: nobody reaches the query layer without the
 * `ai_operations.read` capability, and the shape returned never grows a
 * field that schema does not have.
 */

const support: PlatformAdmin = { profileId: "p-1", role: "support" };
const operator: PlatformAdmin = { profileId: "p-2", role: "operator" };
const owner: PlatformAdmin = { profileId: "p-3", role: "owner" };

/** Throws if ever touched — proves the guard runs before any query. */
const untouchableClient = new Proxy(
  {},
  {
    get() {
      throw new Error("reached the database despite a role with no ai_operations.read capability");
    },
  },
) as never;

describe("ai_operations.read", () => {
  it("is operator and owner only — support has no fleet-wide standing here", () => {
    expect(platformCan(support, "ai_operations.read")).toBe(false);
    expect(platformCan(operator, "ai_operations.read")).toBe(true);
    expect(platformCan(owner, "ai_operations.read")).toBe(true);
  });

  it("refuses support before touching the database", async () => {
    await expect(aiOperationsSummary(untouchableClient, support)).rejects.toThrowError(
      /cannot view AI operations/,
    );
    await expect(listFailedAgentRuns(untouchableClient, support)).rejects.toThrowError(
      /cannot view AI operations/,
    );
    await expect(agentRunDetail(untouchableClient, support, "run-1")).rejects.toThrowError(
      /cannot view AI operations/,
    );
  });
});
