import { describe, expect, it } from "vitest";

import { GRADIENTS, HEART_PATH, HOUSE_PATH, VIEW_BOX } from "./mark";

/**
 * The mark's invariants (design/DESIGN-NOTES.md, "The brand mark").
 *
 * Not a pixel test — the icons on disk are checked against this module by
 * `npm run brand -- --check`. These are the properties that, if broken, give
 * a mark that still renders and still looks wrong.
 */

const coords = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const points = (path: string) => {
  const values = coords(path);
  const out: [number, number][] = [];
  for (let index = 0; index + 1 < values.length; index += 2) out.push([values[index]!, values[index + 1]!]);
  return out;
};

describe("the house silhouette", () => {
  it("stays inside the box", () => {
    for (const value of coords(HOUSE_PATH)) {
      expect(value, `HOUSE_PATH has ${value}`).toBeGreaterThanOrEqual(0);
      expect(value, `HOUSE_PATH has ${value}`).toBeLessThanOrEqual(VIEW_BOX);
    }
  });

  it("is taller than it is narrow at the roofline, so it still reads as a house at favicon size", () => {
    const xs = points(HOUSE_PATH).map(([x]) => x);
    const ys = points(HOUSE_PATH).map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(height).toBeGreaterThan(width * 0.9);
  });
});

describe("the heart cut from the house", () => {
  it("sits inside the house's own bounds, clear of the roofline", () => {
    const houseXs = points(HOUSE_PATH).map(([x]) => x);
    const houseYs = points(HOUSE_PATH).map(([, y]) => y);
    const heartXs = points(HEART_PATH).map(([x]) => x);
    const heartYs = points(HEART_PATH).map(([, y]) => y);

    expect(Math.min(...heartXs)).toBeGreaterThanOrEqual(Math.min(...houseXs));
    expect(Math.max(...heartXs)).toBeLessThanOrEqual(Math.max(...houseXs));
    expect(Math.min(...heartYs)).toBeGreaterThanOrEqual(Math.min(...houseYs));
    expect(Math.max(...heartYs)).toBeLessThanOrEqual(Math.max(...houseYs));
  });

  it("is centred left-to-right under the roof apex", () => {
    const heartXs = points(HEART_PATH).map(([x]) => x);
    const center = (Math.min(...heartXs) + Math.max(...heartXs)) / 2;
    expect(center).toBeCloseTo(VIEW_BOX / 2, 0);
  });
});

describe("the gradients", () => {
  it("run from 0 to 1 with stops in order", () => {
    for (const [name, spec] of Object.entries(GRADIENTS)) {
      const offsets = spec.stops.map((stop) => stop.offset);
      expect(offsets[0], name).toBe(0);
      expect(offsets.at(-1), name).toBe(1);
      expect([...offsets].sort((a, b) => a - b), name).toEqual(offsets);
    }
  });

  it("uses colours a renderer outside the browser can read", () => {
    // The asset script hands these to a rasteriser with no CSS engine, so a
    // token or an oklch() here would come out black on somebody's home screen.
    for (const spec of Object.values(GRADIENTS)) {
      for (const stop of spec.stops) {
        expect(stop.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
