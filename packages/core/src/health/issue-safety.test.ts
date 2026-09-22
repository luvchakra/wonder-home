import { describe, expect, it } from "vitest";

import { assessForMedicalAttention } from "./issue-safety";

describe("assessForMedicalAttention", () => {
  it("recommends seeking medical attention for a concerning phrase", () => {
    const result = assessForMedicalAttention("Chest pain since this morning");
    expect(result.recommend).toBe(true);
    expect(result.message).toMatch(/seeking medical attention/);
  });

  it("says nothing for an ordinary observation", () => {
    const result = assessForMedicalAttention("A small bruise on the knee, seems fine");
    expect(result.recommend).toBe(false);
    expect(result.message).toBeNull();
  });

  it("checks every text argument given, not just the first", () => {
    const result = assessForMedicalAttention("Follow-up note", "Started having trouble breathing today");
    expect(result.recommend).toBe(true);
  });

  it("ignores null and undefined arguments", () => {
    const result = assessForMedicalAttention("Mild headache", null, undefined);
    expect(result.recommend).toBe(false);
  });

  it("never names a condition — the message is always the same fixed sentence", () => {
    const chest = assessForMedicalAttention("chest pain");
    const seizure = assessForMedicalAttention("had a seizure");
    expect(chest.message).toBe(seizure.message);
  });

  it("is case-insensitive", () => {
    expect(assessForMedicalAttention("SEVERE BLEEDING").recommend).toBe(true);
  });
});
