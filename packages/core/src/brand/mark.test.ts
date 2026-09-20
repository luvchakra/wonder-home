import { describe, expect, it } from "vitest";

import {
  BLUE_PATH,
  GRADIENTS,
  HALO,
  HOUSE_PATH,
  LEAF_PATH,
  LEAF_VEIN_PATH,
  PANE,
  STROKE,
  VIEW_BOX,
  WINDOW_PANES,
  YELLOW_PATH,
} from "./mark";

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

describe("the two strokes that make the house", () => {
  it("meet at a seam on the right slope, blue over yellow", () => {
    // The blue tip must reach past where the yellow starts, or a sliver of
    // surface shows through at the apex; and the yellow must start after the
    // apex, or it paints over the roof's blue peak.
    const apex = points(HOUSE_PATH)[2]!;
    const blueTip = points(BLUE_PATH).at(-1)!;
    const yellowStart = points(YELLOW_PATH)[0]!;
    expect(yellowStart[0]).toBeGreaterThan(apex[0]);
    expect(blueTip[0]).toBeGreaterThan(yellowStart[0]);
  });

  it("stand with both feet flat on the same ground line", () => {
    const blueFoot = points(BLUE_PATH)[0]!;
    const yellowFoot = points(YELLOW_PATH).at(-1)!;
    const bodyFeet = points(HOUSE_PATH).filter(([, y]) => y === blueFoot[1]);
    expect(yellowFoot[1]).toBe(blueFoot[1]);
    expect(bodyFeet).toHaveLength(2);
  });
});

describe("the halo that separates the leaf from the wall", () => {
  it("leaves a gap wide enough to see at a favicon's size", () => {
    // At 16px one viewBox unit is a quarter of a pixel; the halo is a stroke
    // around the filled leaf, so the gap is half of it, and below about one
    // unit it closes up entirely.
    expect(HALO.leaf / 2).toBeGreaterThanOrEqual(1);
  });

  it("keeps the vein thinner than the halo, so it reads as a line inside the leaf", () => {
    expect(STROKE.vein).toBeLessThan(HALO.leaf);
  });
});

describe("everything stays inside the box", () => {
  it("keeps every path within the viewBox, allowing for stroke width", () => {
    const widest = Math.max(...Object.values(HALO), ...Object.values(STROKE));
    for (const [name, path] of Object.entries({
      HOUSE_PATH,
      BLUE_PATH,
      YELLOW_PATH,
      LEAF_PATH,
      LEAF_VEIN_PATH,
    })) {
      for (const value of coords(path)) {
        expect(value, `${name} has ${value}`).toBeGreaterThanOrEqual(widest / 2);
        expect(value, `${name} has ${value}`).toBeLessThanOrEqual(VIEW_BOX - widest / 2 + 4);
      }
    }
  });

  it("keeps the window panes inside the house body, clear of the walls", () => {
    const [foot, leftEave, apex, rightEave] = points(HOUSE_PATH) as [number, number][];
    const inset = STROKE.house / 2;
    for (const pane of WINDOW_PANES) {
      expect(pane.x).toBeGreaterThan(leftEave![0] + inset);
      expect(pane.x + PANE.width).toBeLessThan(rightEave![0] - inset);
      expect(pane.y).toBeGreaterThan(apex![1] + inset);
      expect(pane.y + PANE.height).toBeLessThan(foot![1]);
    }
  });

  it("draws four panes in two rows and two columns", () => {
    expect(new Set(WINDOW_PANES.map((pane) => pane.x)).size).toBe(2);
    expect(new Set(WINDOW_PANES.map((pane) => pane.y)).size).toBe(2);
    expect(WINDOW_PANES).toHaveLength(4);
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
