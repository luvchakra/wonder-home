import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { crc32, zipStream } from "./zip";

/** Independent readers of WinZip AES, when the machine has them (CI's Ubuntu has 7-Zip). */
function has(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAS_7Z = has("7z", ["i"]);
const HAS_PYZIPPER = has("python3", ["-I", "-c", "import pyzipper"]);

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

  describe("WinZip AES-256 entries", () => {
    const PASSWORD = "correct horse battery staple";
    const big = new Uint8Array(70_001).map((_, i) => (i * 31 + 7) & 0xff);

    async function aesArchive(): Promise<string> {
      const zip = await collect([
        { name: "readme.txt", data: "This part is not locked.\n" },
        { name: "data/health/health_records.json", data: pieces('[{"label":"Blood', ' test"}', "]\n"), password: PASSWORD },
        { name: "files/health-records/file-001.bin", data: big, password: PASSWORD },
      ]);
      const dir = mkdtempSync(join(tmpdir(), "wh-aes-"));
      const file = join(dir, "out.zip");
      writeFileSync(file, zip);
      return file;
    }

    it("never writes the protected contents in clear", async () => {
      const file = await aesArchive();
      try {
        const bytes = readFileSync(file);
        expect(bytes.includes(Buffer.from("Blood"))).toBe(false);
        expect(bytes.includes(Buffer.from("This part is not locked."))).toBe(true);
      } finally {
        rmSync(join(file, ".."), { recursive: true, force: true });
      }
    });

    it.runIf(HAS_7Z)("opens in 7-Zip with the password, and not without it", async () => {
      const file = await aesArchive();
      const dir = join(file, "..");
      try {
        const listing = execFileSync("7z", ["l", "-slt", file], { encoding: "utf8" });
        expect(listing).toMatch(/Method = AES-256/);
        execFileSync("7z", ["x", `-p${PASSWORD}`, `-o${join(dir, "ok")}`, "-y", file], { stdio: "ignore" });
        expect(JSON.parse(readFileSync(join(dir, "ok/data/health/health_records.json"), "utf8"))).toEqual([{ label: "Blood test" }]);
        expect(Buffer.compare(readFileSync(join(dir, "ok/files/health-records/file-001.bin")), Buffer.from(big))).toBe(0);
        expect(() => execFileSync("7z", ["x", "-pwrong-password-here", `-o${join(dir, "bad")}`, "-y", file], { stdio: "ignore" })).toThrow();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it.runIf(HAS_PYZIPPER)("opens with pyzipper (a second, independent reader), and fails with a wrong password", async () => {
      const file = await aesArchive();
      try {
        const script = [
          "import sys, pyzipper",
          "z = pyzipper.AESZipFile(sys.argv[1])",
          "z.setpassword(sys.argv[2].encode())",
          "a = z.read('data/health/health_records.json').decode()",
          "b = z.read('files/health-records/file-001.bin')",
          "print(a.strip() + '|' + str(len(b)) + '|' + str(sum(b) % 9973))",
        ].join("\n");
        const out = execFileSync("python3", ["-I", "-c", script, file, PASSWORD], { encoding: "utf8" }).trim();
        expect(out).toBe(`[{"label":"Blood test"}]|${big.length}|${big.reduce((sum, value) => sum + value, 0) % 9973}`);
        expect(() => execFileSync("python3", ["-I", "-c", script, file, "wrong-password-here"], { stdio: "ignore" })).toThrow();
      } finally {
        rmSync(join(file, ".."), { recursive: true, force: true });
      }
    });
  });
});
