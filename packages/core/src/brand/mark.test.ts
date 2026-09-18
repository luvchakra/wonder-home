import { describe, expect, it } from "vitest";

import {
  GRADIENTS,
  HALO,
  HOUSE_PATH,
  LEAF_PATH,
  PANE,
  ROOF_PATH,
  STEM_PATH,
  STROKE,
  VIEW_BOX,
  WAVE_PATH,
  WINDOW_PANES,
} from "./mark";

/**
 * The mark's invariants (design/DESIGN-NOTES.md, "The brand mark").
 *
 * Not a pixel test — the icons on disk are checked against this module by
 * `npm run brand -- --check`. These are the properties that, if broken, give
 * a mark that still renders and still looks wrong.
 */

describe("the halos that separate the shapes", () => {
  it("are wider than the strokes they sit behind", () => {
    // A halo narrower than its stroke draws nothing. The leaf's is a stroke
    // around a filled shape, so it is compared against nothing here.
    expect(HALO.wave).toBeGreaterThan(STROKE.wave);
    expect(HALO.stem).toBeGreaterThan(STROKE.stem);
    expect(HALO.leaf).toBeGreaterThan(0);
  });

  it("leave a gap wide enough to see at a favicon's size", () => {
    // At 16px one viewBox unit is a quarter of a pixel; the gap either side
    // is (halo - stroke) / 2, and below about 1 unit it closes up entirely.
    expect((HALO.wave - STROKE.wave) / 2).toBeGreaterThanOrEqual(1);
    expect((HALO.stem - STROKE.stem) / 2).toBeGreaterThanOrEqual(1);
  });
});

describe("everything stays inside the box", () => {
  const coords = (path: string) =>
    (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it("keeps every path within the viewBox, allowing for stroke width", () => {
    const widest = Math.max(...Object.values(HALO), ...Object.values(STROKE));
    for (const [name, path] of Object.entries({
      HOUSE_PATH,
      ROOF_PATH,
      WAVE_PATH,
      STEM_PATH,
      LEAF_PATH,
    })) {
      for (const value of coords(path)) {
        expect(value, `${name} has ${value}`).toBeGreaterThanOrEqual(widest / 2 - VIEW_BOX);
        expect(value, `${name} has ${value}`).toBeLessThanOrEqual(VIEW_BOX - widest / 2 + 8);
      }
    }
  });

  it("keeps the window panes inside the house", () => {
    for (const pane of WINDOW_PANES) {
      expect(pane.x).toBeGreaterThan(14.5);
      expect(pane.x + PANE.width).toBeLessThan(45.6);
      expect(pane.y).toBeGreaterThan(20.6);
      expect(pane.y + PANE.height).toBeLessThan(44);
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
