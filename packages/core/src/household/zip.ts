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
 */

export type ZipEntry = { name: string; data: AsyncIterable<Uint8Array> | Uint8Array | string };

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

    const local = header(30 + nameBytes.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 0x0808, true); // data descriptor follows; names are UTF-8
      v.setUint16(8, 0, true); // stored
      v.setUint16(10, stamp.time, true);
      v.setUint16(12, stamp.date, true);
      v.setUint16(26, nameBytes.length, true);
    });
    local.set(nameBytes, 30);
    yield local;
    offset += local.length;

    let crc = 0;
    let size = 0;
    for await (const chunk of chunksOf(entry.data)) {
      if (chunk.length === 0) continue;
      crc = crc32(chunk, crc);
      size += chunk.length;
      if (size > LIMIT) throw new Error("zip: a file is larger than 4 GB");
      yield chunk;
    }
    offset += size;

    yield header(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc, true);
      v.setUint32(8, size, true);
      v.setUint32(12, size, true);
    });
    offset += 16;
    if (offset > LIMIT) throw new Error("zip: the archive is larger than 4 GB");

    const record = header(46 + nameBytes.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, 0x0808, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, stamp.time, true);
      v.setUint16(14, stamp.date, true);
      v.setUint32(16, crc, true);
      v.setUint32(20, size, true);
      v.setUint32(24, size, true);
      v.setUint16(28, nameBytes.length, true);
      v.setUint32(42, localOffset, true);
    });
    record.set(nameBytes, 46);
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
export function zipReadableStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, now?: Date, onError?: (error: unknown) => void): ReadableStream<Uint8Array> {
  const iterator = zipStream(entries, now);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
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
