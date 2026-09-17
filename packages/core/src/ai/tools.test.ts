import { describe, expect, it } from "vitest";

import { TOOLS, authorizeToolCall, findTool, toolsAvailableTo, type ToolCallContext } from "./tools";

const ctx = (over: Partial<ToolCallContext> = {}): ToolCallContext => ({
  actor: { roles: ["head"] },
  actorHouseholdId: "h-1",
  targetHouseholdId: "h-1",
  autonomy: "execute",
  entitled: true,
  ...over,
});

describe("the tool surface", () => {
  it("refuses a tool it does not define", () => {
    const result = authorizeToolCall("database.raw_query", ctx());
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.code).toBe("unknown_tool");
  });

  it("gives every tool a permission decision and a risk", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length, `${tool.name} needs a description`).toBeGreaterThan(10);
      expect(["safe", "changes_household", "spends_money", "changes_access"]).toContain(tool.risk);
    }
  });

  it("marks spending tools as irreversible", () => {
    for (const tool of TOOLS.filter((t) => t.risk === "spends_money")) {
      expect(tool.reversible, `${tool.name} should not be reversible`).toBe(false);
    }
  });
});

describe("every call is re-checked, independently", () => {
  it("refuses a call reaching into another household before asking about permission", () => {
    const result = authorizeToolCall("outcomes.read", ctx({ targetHouseholdId: "h-2" }));
    expect(result.allowed).toBe(false);
    // Scope first: answering this as a permissions question would leak that the
    // other household exists.
    expect(result.allowed === false && result.code).toBe("cross_household");
  });

  it("refuses a tool the caller has no permission for", () => {
    const result = authorizeToolCall("bills.pay", ctx({ actor: { roles: ["adult"] } }));
    expect(result.allowed === false && result.code).toBe("missing_permission");
  });

  it("refuses an unentitled household before checking the member's role", () => {
    const result = authorizeToolCall("commerce.place_order", ctx({ entitled: false }));
    expect(result.allowed === false && result.code).toBe("not_entitled");
  });

  it("never executes a payment unattended, even for the head on full autonomy", () => {
    const result = authorizeToolCall("bills.pay", ctx());
    expect(result.allowed).toBe(true);
    expect(result.allowed === true && result.requiresApproval).toBe(true);
  });

  it("never executes a permission change unattended", () => {
    const result = authorizeToolCall("members.set_role", ctx());
    expect(result.allowed === true && result.requiresApproval).toBe(true);
  });

  it("allows a safe read in any autonomy mode, including observe", () => {
    const result = authorizeToolCall("outcomes.read", ctx({ autonomy: "observe" }));
    expect(result.allowed === true && result.requiresApproval).toBe(false);
  });

  it("refuses a household change when the outcome is set to observe", () => {
    const result = authorizeToolCall("availability.record_absence", ctx({ autonomy: "observe" }));
    expect(result.allowed === false && result.code).toBe("autonomy_forbids");
  });

  it("asks first when autonomy is set to approve", () => {
    const result = authorizeToolCall("outcomes.replan", ctx({ autonomy: "approve" }));
    expect(result.allowed === true && result.requiresApproval).toBe(true);
  });
});

describe("the tools an agent is offered", () => {
  it("hides what the caller could never use", () => {
    const names = toolsAvailableTo({
      actor: { roles: ["child"], memberType: "child" },
      actorHouseholdId: "h-1",
      autonomy: "execute",
      entitled: true,
    }).map((tool) => tool.name);

    expect(names).not.toContain("bills.pay");
    expect(names).not.toContain("members.set_role");
    expect(names).toContain("outcomes.read");
  });

  it("leaves only safe tools for an unentitled household", () => {
    const tools = toolsAvailableTo({
      actor: { roles: ["head"] },
      actorHouseholdId: "h-1",
      autonomy: "execute",
      entitled: false,
    });
    expect(tools.every((tool) => tool.risk === "safe")).toBe(true);
  });

  it("is a convenience, never the control", () => {
    // A child is not offered bills.pay — and if a call for it arrives anyway,
    // it is still refused. The filtered list narrows the surface; it does not
    // enforce anything.
    const child = { roles: ["child"] as const, memberType: "child" as const };
    expect(toolsAvailableTo({ actor: child, actorHouseholdId: "h-1", autonomy: "execute", entitled: true })
      .map((t) => t.name)).not.toContain("bills.pay");

    const result = authorizeToolCall("bills.pay", ctx({ actor: child }));
    expect(result.allowed).toBe(false);
  });

  it("finds a tool by name, or nothing", () => {
    expect(findTool("bills.pay")?.name).toBe("bills.pay");
    expect(findTool("bills.pay_secretly")).toBeNull();
  });
});
