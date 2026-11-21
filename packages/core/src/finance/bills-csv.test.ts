import { describe, expect, it } from "vitest";

import { billsCsv, csvCell, decimal } from "./bills-csv";

const exponentOf = (currency: string) => (currency === "JPY" ? 0 : 2);

describe("a year's bills as CSV (11-025)", () => {
  it("writes money as decimal in its own currency", () => {
    expect(decimal(816882, 2)).toBe("8168.82");
    expect(decimal(5, 2)).toBe("0.05");
    expect(decimal(1200, 0)).toBe("1200");
  });

  it("keeps a formula from running and quotes what needs it", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("Rent, flat 4")).toBe('"Rent, flat 4"');
    expect(csvCell(null)).toBe("");
  });

  it("lists the year's bills then payments, one currency column, nothing converted", () => {
    const csv = billsCsv({
      year: 2026,
      exponentOf,
      bills: [
        { id: "b1", name: "Electricity", kind: "utility", payee: "MSEB", dueOn: "2026-11-05", status: "expected", amountMinor: 120050, currency: "INR", owner: "Asha", recurrence: "monthly" },
        { id: "b2", name: "Old bill", kind: "other", payee: null, dueOn: "2025-12-01", status: "paid", amountMinor: 100, currency: "INR", owner: null, recurrence: null },
      ],
      payments: [
        { obligationId: "b1", periodLabel: "2026-10", amountMinor: 50000, currency: "INR", paidOn: "2026-10-04", paidWith: "upi", partOfMinor: 120000, payee: null, kind: null, owner: null },
        { obligationId: "b1", periodLabel: "2026-09", amountMinor: 3000, currency: "USD", paidOn: null, paidWith: null, partOfMinor: null, payee: null, kind: null, owner: null },
      ],
    });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("record,name,kind,payee,person,month,due_on,paid_on,amount,currency,paid_with,part_of,status,repeats");
    expect(lines[1]).toBe("bill,Electricity,utility,MSEB,Asha,2026-11,2026-11-05,,1200.50,INR,,,expected,monthly");
    expect(lines[2]).toBe("payment,Electricity,utility,MSEB,Asha,2026-09,,,30.00,USD,,,paid,");
    expect(lines[3]).toBe("payment,Electricity,utility,MSEB,Asha,2026-10,,2026-10-04,500.00,INR,upi,1200.00,part paid,");
    expect(lines).toHaveLength(4);
  });
});
