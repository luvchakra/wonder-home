import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64, downsample, floatToPcm16, pcm16ToFloat } from "./pcm";

describe("audio for Gemini Live", () => {
  it("downsamples 48 kHz to 16 kHz by averaging each window", () => {
    const input = new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]);
    expect(Array.from(downsample(input, 48_000, 16_000)).map((value) => Number(value.toFixed(3)))).toEqual([0.3, -0.6]);
  });

  it("passes a rate already at or below the target through", () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsample(input, 16_000, 16_000)).toBe(input);
  });

  it("writes 16-bit little-endian PCM, clipping rather than wrapping", () => {
    const bytes = floatToPcm16(new Float32Array([0, 1, -1, 2, -2]));
    const view = new DataView(bytes.buffer);
    expect([0, 1, 2, 3, 4].map((index) => view.getInt16(index * 2, true))).toEqual([0, 32767, -32768, 32767, -32768]);
  });

  it("reads PCM back within a sample's precision, ignoring a trailing odd byte", () => {
    const samples = new Float32Array([0.5, -0.25, 0]);
    const back = pcm16ToFloat(floatToPcm16(samples));
    expect(Array.from(back).map((value) => Number(value.toFixed(3)))).toEqual([0.5, -0.25, 0]);
    expect(pcm16ToFloat(new Uint8Array([0, 64, 7])).length).toBe(1);
  });

  it("round-trips base64, including buffers larger than one chunk", () => {
    const bytes = new Uint8Array(70_000).map((_, index) => index % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
