import { describe, expect, it } from "vitest";

import { partnerAddGroceries, partnerGroceries, partnerHousehold, SANDBOX_GROCERIES } from "./partner";

const untouched = new Proxy({}, { get: () => { throw new Error("a sandbox key must not touch the database"); } }) as never;
const sandbox = { keyId: "k", householdId: "h", environment: "sandbox" as const, scopes: ["household.read", "groceries.read", "groceries.write"] as const };

describe("a sandbox key", () => {
  it("reads fixtures and never the database", async () => {
    await expect(partnerHousehold(untouched, sandbox)).resolves.toMatchObject({ name: "Sandbox Household", environment: "sandbox" });
    await expect(partnerGroceries(untouched, sandbox)).resolves.toHaveLength(SANDBOX_GROCERIES.length);
  });

  it("answers what an add would do, and saves nothing", async () => {
    await expect(partnerAddGroceries(untouched, sandbox, ["milk", "Eggs", "eggs", "  "])).resolves.toEqual([
      { name: "milk", outcome: "already_on_list", id: "sandbox-milk" },
      { name: "eggs", outcome: "would_add", id: null },
    ]);
  });
});

describe("scopes", () => {
  it("refuse before anything is read", async () => {
    const readOnly = { ...sandbox, environment: "live" as const, scopes: ["groceries.read"] as const };
    await expect(partnerHousehold(untouched, readOnly)).rejects.toMatchObject({ code: "forbidden" });
    await expect(partnerAddGroceries(untouched, readOnly, ["milk"])).rejects.toMatchObject({ code: "forbidden" });
  });

  it("an empty add is a bad request", async () => {
    await expect(partnerAddGroceries(untouched, sandbox, [" "])).rejects.toMatchObject({ code: "bad_request" });
  });
});
