import { describe, expect, it } from "vitest";

import { vcardHref } from "./home-send-channels";

describe("vcardHref", () => {
  it("is a vCard with the forwarding address, safe against line breaks in the name", () => {
    const href = vcardHref("asmi-home.x7k2@in.wonderapps.biz", "WonderHome\r\nHomeSend;");
    expect(href.startsWith("data:text/vcard;charset=utf-8,")).toBe(true);
    const card = decodeURIComponent(href.slice("data:text/vcard;charset=utf-8,".length));
    expect(card.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:WonderHome  HomeSend",
      "N:;WonderHome  HomeSend;;;",
      "ORG:WonderHome",
      "EMAIL;TYPE=INTERNET:asmi-home.x7k2@in.wonderapps.biz",
      "END:VCARD",
    ]);
  });
});
