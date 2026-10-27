import { describe, expect, it, vi } from "vitest";

import { homeSendPortalFiler, portalItemText } from "./homesend-filer";
import type { RawPortalItem } from "./fetch-connection";

const item = (over: Partial<RawPortalItem> = {}): RawPortalItem => ({
  title: "This week's homework",
  kind: "homework",
  subject: "Maths",
  dueOn: "2026-10-27",
  detail: "Worksheet 3, due Friday.",
  sourceUrl: "https://app.looplearning.com/task/list",
  ...over,
});

describe("portalItemText", () => {
  it("labels the title, subject and date and appends the body", () => {
    const text = portalItemText(item());
    expect(text).toContain("This week's homework");
    expect(text).toContain("Subject: Maths");
    expect(text).toContain("Date: 2026-10-27");
    expect(text).toContain("Worksheet 3, due Friday.");
  });
});

describe("homeSendPortalFiler", () => {
  const fakeIngest = () =>
    vi.fn(async (_s: unknown, _actor: { householdId: string; memberId: string }, _input: { text: string }) => ({}) as never);

  it("files each item through HomeSend as the actor", async () => {
    const ingest = fakeIngest();
    const actor = { householdId: "h1", memberId: "m1" };
    const filer = homeSendPortalFiler({} as never, actor, ingest);

    await filer.file({ connectionId: "c1", items: [item({ title: "A" }), item({ title: "B" })] });

    expect(ingest).toHaveBeenCalledTimes(2);
    expect(ingest.mock.calls[0]![1]).toEqual(actor);
    expect(ingest.mock.calls[0]![2].text).toContain("A");
    expect(ingest.mock.calls[1]![2].text).toContain("B");
  });

  it("skips an item with no text", async () => {
    const ingest = fakeIngest();
    const filer = homeSendPortalFiler({} as never, { householdId: "h", memberId: "m" }, ingest);
    await filer.file({ connectionId: "c", items: [item({ title: "", subject: null, dueOn: null, detail: "" })] });
    expect(ingest).not.toHaveBeenCalled();
  });
});
