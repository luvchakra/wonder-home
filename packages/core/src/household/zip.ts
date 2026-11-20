/**
 * A streaming ZIP writer, just enough for the full household download (story 15-014).
 *
 * Stored (uncompressed) entries with a data descriptor after each file, so a
 * file is written as it is read — a table page by page, an upload as it comes
 * back — and nothing has to be held whole to know its size or checksum first.
 * Memory stays at one page or one uploaded file, whatever the household's size.
 *
 * Plain ZIP (no ZIP64): an archive past 4 GB or 65,535 files is refused rather
 * than written broken. Every unzip tool reads stored entries with descriptors.
 *
 * An entry with a `password` is written as WinZip AES-256, AE-2 (the format's
 * own specification: https://www.winzip.com/en/support/aes-encryption/): a
 * random 16-byte salt per file, PBKDF2-HMAC-SHA1 with the specification's 1,000
 * iterations to a 256-bit AES key, a 256-bit HMAC key and a 2-byte password
 * check, AES-256 in CTR mode with the format's little-endian counter, and an
 * HMAC-SHA1 authentication code over the encrypted bytes. Node's own crypto
 * does every primitive; nothing here is a home-made cipher. The 1,000 iterations
 * are fixed by the format (a reader would fail otherwise), which is why the
 * password it is used with must be long (`HEALTH_PASSWORD_MIN`).
 */

import { createCipheriv, createHmac, pbkdf2Sync, randomBytes, type Hmac } from "node:crypto";

export type ZipEntry = {
  name: string;
  data: AsyncIterable<Uint8Array> | Uint8Array | string;
  /**
   * Encrypts this entry with WinZip AES-256 (AE-2), the password-protected ZIP
   * that 7-Zip, Keka, WinZip, macOS/Windows archivers and most phone file apps
   * open. Never the legacy "ZipCrypto", which is broken.
   */
  password?: string;
};

const LIMIT = 0xffffffff;
const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE), continued from `crc` so a file can be checksummed in pieces. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

const AES_SALT = 16;
const AES_MAC = 10;

/** AES-256-CTR as WinZip AES defines it: a 128-bit little-endian block counter starting at 1. */
class WinZipAesCtr {
  private readonly ecb;
  private counter = 1;
  private spare = new Uint8Array(0);

  constructor(key: Uint8Array) {
    this.ecb = createCipheriv("aes-256-ecb", key, null);
    this.ecb.setAutoPadding(false);
  }

  update(input: Uint8Array): Uint8Array {
    const out = new Uint8Array(input.length);
    let at = 0;
    while (at < input.length) {
      if (this.spare.length === 0) {
        const blocks = Math.max(1, Math.ceil((input.length - at) / 16));
        const counters = new Uint8Array(blocks * 16);
        const view = new DataView(counters.buffer);
        for (let b = 0; b < blocks; b++) {
          const n = this.counter++;
          view.setUint32(b * 16, n % 0x100000000, true);
          view.setUint32(b * 16 + 4, Math.floor(n / 0x100000000), true);
        }
        this.spare = new Uint8Array(this.ecb.update(counters));
      }
      const take = Math.min(this.spare.length, input.length - at);
      for (let i = 0; i < take; i++) out[at + i] = input[at + i]! ^ this.spare[i]!;
      this.spare = this.spare.subarray(take);
      at += take;
    }
    return out;
  }
}

type AesState = { ctr: WinZipAesCtr; mac: Hmac; head: Uint8Array };

/** Pure on its inputs: keys and the 18-byte header (salt + password check) for one encrypted entry. */
export function winZipAesKeys(password: string, salt: Uint8Array): { aesKey: Uint8Array; macKey: Uint8Array; check: Uint8Array } {
  const derived = new Uint8Array(pbkdf2Sync(Buffer.from(password, "utf8"), salt, 1000, 66, "sha1"));
  return { aesKey: derived.subarray(0, 32), macKey: derived.subarray(32, 64), check: derived.subarray(64, 66) };
}

function startAes(password: string): AesState {
  const salt = new Uint8Array(randomBytes(AES_SALT));
  const { aesKey, macKey, check } = winZipAesKeys(password, salt);
  const head = new Uint8Array(AES_SALT + 2);
  head.set(salt, 0);
  head.set(check, AES_SALT);
  return { ctr: new WinZipAesCtr(aesKey), mac: createHmac("sha1", macKey), head };
}

/** The AES extra field: AE-2, vendor "AE", AES-256, inner method stored. */
function aesExtra(): Uint8Array {
  return header(11, (v) => {
    v.setUint16(0, 0x9901, true);
    v.setUint16(2, 7, true);
    v.setUint16(4, 2, true);
    v.setUint8(6, 0x41);
    v.setUint8(7, 0x45);
    v.setUint8(8, 3);
    v.setUint16(9, 0, true);
  });
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function header(size: number, fill: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
}

async function* chunksOf(data: ZipEntry["data"]): AsyncIterable<Uint8Array> {
  if (typeof data === "string") yield encoder.encode(data);
  else if (data instanceof Uint8Array) yield data;
  else for await (const chunk of data) yield chunk;
}

/** The archive's bytes, entry by entry, as they are produced. */
export async function* zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, now: Date = new Date()): AsyncGenerator<Uint8Array> {
  const stamp = dosDateTime(now);
  const central: Uint8Array[] = [];
  const names = new Set<string>();
  let offset = 0;
  let count = 0;

  for await (const entry of entries as AsyncIterable<ZipEntry>) {
    const name = entry.name.replace(/^\/+/, "");
    if (!name || names.has(name)) throw new Error(`zip: bad or repeated entry name "${entry.name}"`);
    names.add(name);
    const nameBytes = encoder.encode(name);
    const localOffset = offset;
    const aes = entry.password ? startAes(entry.password) : null;
    const extra = aes ? aesExtra() : new Uint8Array(0);
    // Data descriptor follows; names are UTF-8; bit 0 marks an encrypted entry.
    const flags = aes ? 0x0809 : 0x0808;
    const method = aes ? 99 : 0;
    const needs = aes ? 51 : 20;

    const local = header(30 + nameBytes.length + extra.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, needs, true);
      v.setUint16(6, flags, true);
      v.setUint16(8, method, true);
      v.setUint16(10, stamp.time, true);
      v.setUint16(12, stamp.date, true);
      v.setUint16(26, nameBytes.length, true);
      v.setUint16(28, extra.length, true);
    });
    local.set(nameBytes, 30);
    local.set(extra, 30 + nameBytes.length);
    yield local;
    offset += local.length;

    let crc = 0;
    let size = 0;
    let stored = 0;
    if (aes) {
      yield aes.head;
      stored += aes.head.length;
    }
    for await (const chunk of chunksOf(entry.data)) {
      if (chunk.length === 0) continue;
      size += chunk.length;
      if (size > LIMIT) throw new Error("zip: a file is larger than 4 GB");
      if (aes) {
        const sealed = aes.ctr.update(chunk);
        aes.mac.update(sealed);
        stored += sealed.length;
        yield sealed;
      } else {
        crc = crc32(chunk, crc);
        stored += chunk.length;
        yield chunk;
      }
    }
    if (aes) {
      // AE-2: the CRC is left 0 and the authentication code stands in for it.
      const code = new Uint8Array(aes.mac.digest()).subarray(0, AES_MAC);
      yield code;
      stored += code.length;
    }
    offset += stored;

    yield header(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc, true);
      v.setUint32(8, stored, true);
      v.setUint32(12, size, true);
    });
    offset += 16;
    if (offset > LIMIT) throw new Error("zip: the archive is larger than 4 GB");

    const record = header(46 + nameBytes.length + extra.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, needs, true);
      v.setUint16(6, needs, true);
      v.setUint16(8, flags, true);
      v.setUint16(10, method, true);
      v.setUint16(12, stamp.time, true);
      v.setUint16(14, stamp.date, true);
      v.setUint32(16, crc, true);
      v.setUint32(20, stored, true);
      v.setUint32(24, size, true);
      v.setUint16(28, nameBytes.length, true);
      v.setUint16(30, extra.length, true);
      v.setUint32(42, localOffset, true);
    });
    record.set(nameBytes, 46);
    record.set(extra, 46 + nameBytes.length);
    central.push(record);
    count += 1;
    if (count > 0xffff) throw new Error("zip: more than 65,535 files");
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const record of central) {
    yield record;
    centralSize += record.length;
  }

  yield header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, count, true);
    v.setUint16(10, count, true);
    v.setUint32(12, centralSize, true);
    v.setUint32(16, centralOffset, true);
  });
}

/** A web stream of the archive, pulled as the reader is ready (so a slow download never piles up in memory). */
export function zipReadableStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  now?: Date,
  onError?: (error: unknown) => void,
  onDone?: () => void,
): ReadableStream<Uint8Array> {
  const iterator = zipStream(entries, now);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          onDone?.();
        }
        else controller.enqueue(next.value);
      } catch (error) {
        onError?.(error);
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
