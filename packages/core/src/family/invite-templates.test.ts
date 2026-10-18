import { describe, expect, it } from "vitest";

import { cleanInviteMessage, INVITE_TEMPLATES, inviteDesign, isInviteTemplate, suggestTemplate, svgDataUri, templateFor } from "./invite-templates";

describe("suggestTemplate", () => {
  it.each([
    [{ kind: "birthday", title: "Asmi Chakraborty's birthday" }, "birthday"],
    [{ kind: "gathering", title: "Mummy-Papa's 25th wedding anniversary" }, "anniversary"],
    [{ kind: "special_occasion", title: "Riya's wedding" }, "wedding"],
    [{ kind: "special_occasion", title: "Sangeet night" }, "wedding"],
    [{ kind: "gathering", title: "Diwali at ours" }, "festival"],
    [{ kind: "gathering", title: "Holi milan" }, "festival"],
    [{ kind: "gathering", title: "Satyanarayan puja" }, "puja"],
    [{ kind: "gathering", title: "गणेश पूजा" }, "puja"],
    [{ kind: "gathering", title: "Griha pravesh" }, "housewarming"],
    [{ kind: "gathering", title: "Housewarming party" }, "housewarming"],
    [{ kind: "special_occasion", title: "Baby shower for Neha" }, "baby"],
    [{ kind: "special_occasion", title: "Naamkaran ceremony" }, "baby"],
    [{ kind: "gathering", title: "Sunday lunch" }, "dinner"],
    [{ kind: "outing", title: "Picnic at Lodhi Garden" }, "dinner"],
    [{ kind: "gathering", title: "Cousins over" }, "dinner"],
    [{ kind: "school_event", title: "Annual day" }, "classic"],
    [{ kind: "appointment", title: "Dentist" }, "classic"],
  ] as const)("%o → %s", (event, expected) => {
    expect(suggestTemplate(event)).toBe(expected);
  });

  it("a birthday kind wins over nothing in the title", () => {
    expect(suggestTemplate({ kind: "birthday", title: "Asmi turns 9" })).toBe("birthday");
  });
});

describe("templateFor", () => {
  it("keeps the household's own pick", () => {
    expect(templateFor({ inviteTemplate: "festival", kind: "birthday", title: "Asmi's birthday" })).toBe("festival");
  });
  it("ignores an unknown stored value and suggests instead", () => {
    expect(templateFor({ inviteTemplate: "neon", kind: "birthday", title: "Asmi's birthday" })).toBe("birthday");
    expect(isInviteTemplate("neon")).toBe(false);
  });
});

describe("inviteDesign", () => {
  it("every design has a palette and two well-formed drawings", () => {
    for (const template of INVITE_TEMPLATES) {
      const design = inviteDesign(template);
      expect(design.palette.paper).toMatch(/^#[0-9A-F]{6}$/i);
      expect(design.band.startsWith("<svg") && design.band.endsWith("</svg>")).toBe(true);
      expect(design.corner).toContain('viewBox="0 0 200 200"');
      expect(design.band).not.toMatch(/NaN|undefined/);
      expect(design.corner).not.toMatch(/NaN|undefined/);
      expect(svgDataUri(design.corner)).toMatch(/^data:image\/svg\+xml;base64,/);
    }
  });

  it("ink reads on its paper (WCAG AA for body text)", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const template of INVITE_TEMPLATES) {
      const { paper, ink, muted } = inviteDesign(template).palette;
      expect(ratio(ink, paper)).toBeGreaterThanOrEqual(7);
      expect(ratio(muted, paper)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("cleanInviteMessage", () => {
  it("trims, keeps paragraphs and caps the length", () => {
    expect(cleanInviteMessage("  Come hungry!  \r\n\r\n\r\n Bring the kids ")).toBe("Come hungry!\n\nBring the kids");
    expect(cleanInviteMessage("   ")).toBeNull();
    expect(cleanInviteMessage("x".repeat(400))).toHaveLength(300);
  });
});
