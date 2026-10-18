import { describe, expect, it } from "vitest";

import { cleanTranscript, pcmToWav, transcriptionInstruction, transcriptionVocabulary } from "./live-transcribe";

describe("pcmToWav", () => {
  it("puts a 16 kHz mono 16-bit WAV header in front of the audio", () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]));
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
    expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
  });
});

describe("transcriptionVocabulary", () => {
  it("names the household's people, full and first names, and WonderHome's own words", () => {
    expect(transcriptionVocabulary(["Asmi Chakraborty", "Manan", "  "])).toEqual(["WonderHome", "HomeTalk", "Asmi Chakraborty", "Asmi", "Manan"]);
  });
});

describe("transcriptionInstruction", () => {
  it("asks for the words as said, in the listening language, with the names spelt right", () => {
    const text = transcriptionInstruction({ languageCode: "en-IN", vocabulary: ["Asmi", "Manan"] });
    expect(text).toContain("word for word");
    expect(text).toContain("en-IN");
    expect(text).toContain("Asmi, Manan");
    expect(text).toContain("Do not answer, translate");
  });
});

describe("cleanTranscript", () => {
  it("keeps one line without wrapping quotes, and nothing for nothing", () => {
    expect(cleanTranscript('"Add milk\n to the list"')).toBe("Add milk to the list");
    expect(cleanTranscript("  ")).toBeNull();
    expect(cleanTranscript(undefined)).toBeNull();
  });
});
