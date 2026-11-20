import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { crc32, zipStream } from "./zip";

async function collect(entries: Parameters<typeof zipStream>[0]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const part of zipStream(entries, new Date("2026-11-20T10:00:00Z"))) parts.push(part);
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function* pieces(...texts: string[]) {
  for (const text of texts) yield new TextEncoder().encode(text);
}

describe("zip (story 15-014)", () => {
  it("computes the standard CRC-32, in pieces too", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
    expect(crc32(bytes.slice(4), crc32(bytes.slice(0, 4)))).toBe(0xcbf43926);
  });

  it("writes an archive a real unzip tool reads back exactly", async () => {
    const zip = await collect([
      { name: "README.txt", data: "What is in this download.\n" },
      { name: "data/people/household_members.json", data: pieces("[\n", '{"display_name":"Asha"}', "\n]\n") },
      { name: "files/home-send/h/ä.bin", data: new Uint8Array([0, 1, 2, 255]) },
      { name: "empty.json", data: "" },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "wh-zip-"));
    try {
      const file = join(dir, "out.zip");
      writeFileSync(file, zip);
      const script = [
        "import json, sys, zipfile",
        "z = zipfile.ZipFile(sys.argv[1])",
        "assert z.testzip() is None",
        "print(json.dumps({n: z.read(n).hex() for n in z.namelist()}))",
      ].join("\n");
      const read = JSON.parse(execFileSync("python3", ["-I", "-c", script, file], { encoding: "utf8" })) as Record<string, string>;
      const text = (hex: string) => Buffer.from(hex, "hex").toString("utf8");
      expect(Object.keys(read)).toEqual(["README.txt", "data/people/household_members.json", "files/home-send/h/ä.bin", "empty.json"]);
      expect(text(read["README.txt"]!)).toBe("What is in this download.\n");
      expect(JSON.parse(text(read["data/people/household_members.json"]!))).toEqual([{ display_name: "Asha" }]);
      expect(read["files/home-send/h/ä.bin"]).toBe("000102ff");
      expect(read["empty.json"]).toBe("");
      expect(readFileSync(file).subarray(0, 4).toString("hex")).toBe("504b0304");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a repeated name rather than writing an ambiguous archive", async () => {
    await expect(collect([{ name: "a.json", data: "1" }, { name: "a.json", data: "2" }])).rejects.toThrow(/repeated/);
  });
});
