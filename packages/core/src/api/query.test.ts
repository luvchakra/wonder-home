import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "./errors";
import { parseQuery } from "./query";

const schema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30), q: z.string().max(5).optional() });
const req = (qs: string) => new Request(`https://x.test/api?${qs}`);

describe("parseQuery", () => {
  it("applies defaults and coerces", () => {
    expect(parseQuery(req(""), schema)).toEqual({ days: 30 });
    expect(parseQuery(req("days=7&q=ab"), schema)).toEqual({ days: 7, q: "ab" });
  });
  it("rejects out-of-range and over-long values with a 400", () => {
    for (const qs of ["days=0", "days=9999", "days=abc", "q=toolong"]) {
      try {
        parseQuery(req(qs), schema);
        throw new Error("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe("bad_request");
      }
    }
  });
});
