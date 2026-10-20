import { describe, expect, it } from "vitest";

import { BILL_TYPES, BILL_TYPE_NAMES, billTypeFor } from "./bill-catalog";
import { homePlaceFrom, payeesFor } from "./payees";

describe("homePlaceFrom", () => {
  it("reads the state and city a Google-formatted address names", () => {
    expect(homePlaceFrom("12, 80 Feet Rd, Koramangala, Bengaluru, Karnataka 560034, India", "IN")).toEqual({ country: "IN", state: "Karnataka", city: "Bengaluru" });
    expect(homePlaceFrom("Flat 4, Hill Road, Bandra West, Mumbai, Maharashtra 400050, India", "IN")).toEqual({ country: "IN", state: "Maharashtra", city: "Mumbai" });
    expect(homePlaceFrom("Sector 62, Noida, Uttar Pradesh 201309, India", "IN")).toMatchObject({ state: "Uttar Pradesh", city: "Noida" });
    expect(homePlaceFrom("Vasant Kunj, New Delhi, Delhi 110070, India", "IN")).toMatchObject({ state: "Delhi", city: "Delhi" });
  });

  it("knows the state without a city it has payees for, and nothing outside India", () => {
    expect(homePlaceFrom("MG Road, Kochi, Kerala 682016, India", "IN")).toEqual({ country: "IN", state: "Kerala", city: null });
    expect(homePlaceFrom("10 Downing St, London SW1A 2AA, UK", "GB")).toEqual({ country: "GB", state: null, city: null });
    expect(homePlaceFrom(null, "IN")).toEqual({ country: "IN", state: null, city: null });
  });
});

describe("payeesFor", () => {
  it("offers a city's own electricity companies first, then the state's", () => {
    const mumbai = payeesFor("electricity", { country: "IN", state: "Maharashtra", city: "Mumbai" });
    expect(mumbai.near.slice(0, 3)).toEqual(["Adani Electricity Mumbai", "Tata Power (Mumbai)", "BEST Undertaking"]);
    expect(mumbai.near).toContain("MSEDCL (Mahavitaran)");
    expect(mumbai.near).not.toContain("BESCOM");
    const bengaluru = payeesFor("electricity", { country: "IN", state: "Karnataka", city: "Bengaluru" });
    expect(bengaluru.near[0]).toBe("BESCOM");
    expect([...bengaluru.near, ...bengaluru.others]).not.toContain("BSES Rajdhani");
  });

  it("offers the national ones for telecom, banks and insurers wherever the home is", () => {
    expect(payeesFor("mobile", { country: "IN", state: "Kerala", city: null }).others).toEqual(["Jio", "Airtel", "Vi (Vodafone Idea)", "BSNL"]);
    expect(payeesFor("bank", { country: "IN", state: null, city: null }).others).toContain("HDFC Bank");
  });

  it("offers no Indian companies to a home outside India, and none for a bill with no payee list", () => {
    expect(payeesFor("electricity", { country: "GB", state: null, city: null })).toEqual({ near: [], others: [] });
    expect(payeesFor("none", { country: "IN", state: "Delhi", city: "Delhi" })).toEqual({ near: [], others: [] });
  });

  it("still lets a household with no address saved pick its electricity company", () => {
    expect(payeesFor("electricity", { country: "IN", state: null, city: null }).others.length).toBeGreaterThan(20);
  });
});

describe("bill types", () => {
  it("names every type, and reads the words people use", () => {
    for (const type of BILL_TYPES) expect(BILL_TYPE_NAMES[type.key]).toBeTruthy();
    expect(billTypeFor("the light bill")).toBe("electricity");
    expect(billTypeFor("wifi")).toBe("broadband");
    expect(billTypeFor("home loan EMI")).toBe("home_loan");
    expect(billTypeFor("society maintenance")).toBe("maintenance");
    expect(billTypeFor("something new")).toBeNull();
  });
});
