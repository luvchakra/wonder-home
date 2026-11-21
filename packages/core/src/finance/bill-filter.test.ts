import { describe, expect, it } from "vitest";

import { isFiltering, matchesBill, matchesPayment, parseBillFilter, payeeChoices } from "./bill-filter";

const rent = { kind: "rent", payee: "Mr Rao", responsibleMemberId: "m1" };

describe("filtering bills (11-025)", () => {
  it("matches everything with no choice made", () => {
    const filter = parseBillFilter({});
    expect(isFiltering(filter)).toBe(false);
    expect(matchesBill(rent, filter)).toBe(true);
  });

  it("filters by kind, payee (any case) and person together", () => {
    expect(matchesBill(rent, parseBillFilter({ kind: "rent", payee: "mr rao", who: "m1" }))).toBe(true);
    expect(matchesBill(rent, parseBillFilter({ kind: "utility" }))).toBe(false);
    expect(matchesBill(rent, parseBillFilter({ who: "m2" }))).toBe(false);
  });

  it("uses a payment's own payee and person before its bill's", () => {
    const row = { kind: null, payee: "Landlord Co", owner_member_id: "m2" };
    expect(matchesPayment(row, rent, parseBillFilter({ payee: "Landlord Co", who: "m2" }))).toBe(true);
    expect(matchesPayment(row, rent, parseBillFilter({ payee: "Mr Rao" }))).toBe(false);
    expect(matchesPayment(row, rent, parseBillFilter({ kind: "rent" }))).toBe(true);
  });

  it("offers each payee once, sorted", () => {
    expect(payeeChoices(["MSEB", "mseb", null, "Airtel"])).toEqual(["Airtel", "MSEB"]);
  });
});
