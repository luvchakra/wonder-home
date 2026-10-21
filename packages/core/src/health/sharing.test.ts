import { describe, expect, it } from "vitest";

import { planSharingChange, viewersBySubject } from "./sharing";

const SUBJECT = "subject";

describe("planSharingChange", () => {
  it("grants the newly ticked and revokes the unticked", () => {
    const change = planSharingChange({
      subjectMemberId: SUBJECT,
      current: [
        { id: "c1", viewerMemberId: "a" },
        { id: "c2", viewerMemberId: "b" },
      ],
      ticked: ["b", "c"],
    });
    expect(change).toEqual({ grant: ["c"], revoke: ["c1"] });
  });

  it("changes nothing when the ticks match", () => {
    expect(planSharingChange({ subjectMemberId: SUBJECT, current: [{ id: "c1", viewerMemberId: "a" }], ticked: ["a"] })).toEqual({ grant: [], revoke: [] });
  });

  it("revokes everyone when nobody is ticked", () => {
    expect(
      planSharingChange({
        subjectMemberId: SUBJECT,
        current: [
          { id: "c1", viewerMemberId: "a" },
          { id: "c2", viewerMemberId: "b" },
        ],
        ticked: [],
      }),
    ).toEqual({ grant: [], revoke: ["c1", "c2"] });
  });

  it("never grants the subject to themselves, and grants a repeated tick once", () => {
    expect(planSharingChange({ subjectMemberId: SUBJECT, current: [], ticked: [SUBJECT, "a", "a"] })).toEqual({ grant: ["a"], revoke: [] });
  });
});

describe("viewersBySubject", () => {
  it("groups viewer ids under their subject", () => {
    expect(
      viewersBySubject([
        { subjectMemberId: "s1", viewerMemberId: "a" },
        { subjectMemberId: "s1", viewerMemberId: "b" },
        { subjectMemberId: "s2", viewerMemberId: "a" },
      ]),
    ).toEqual({ s1: ["a", "b"], s2: ["a"] });
  });
});
