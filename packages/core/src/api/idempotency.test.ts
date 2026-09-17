import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import {
  fingerprint,
  idempotencyKeyFrom,
  stableStringify,
  withIdempotency,
  type IdempotencyStore,
  type RecordedResponse,
} from "./idempotency";

function memoryStore(): IdempotencyStore & { size: () => number } {
  const rows = new Map<string, { requestHash: string; response: RecordedResponse }>();
  return {
    size: () => rows.size,
    async lookup(key, endpoint) {
      return rows.get(`${endpoint}:${key}`) ?? null;
    },
    async record({ key, endpoint, requestHash, response }) {
      rows.set(`${endpoint}:${key}`, { requestHash, response });
    },
  };
}

const headers = (value?: string) => new Headers(value ? { "idempotency-key": value } : {});

describe("idempotency keys", () => {
  it("accepts a reasonable key and reports its absence as null", () => {
    expect(idempotencyKeyFrom(headers("order-2026-09-17-abc"))).toBe("order-2026-09-17-abc");
    expect(idempotencyKeyFrom(headers())).toBeNull();
  });

  it("rejects a key too short to be unique or too long to store", () => {
    expect(() => idempotencyKeyFrom(headers("short"))).toThrowError(ApiError);
    expect(() => idempotencyKeyFrom(headers("x".repeat(256)))).toThrowError(ApiError);
  });

  it("rejects a key containing characters that do not belong in a header", () => {
    expect(() => idempotencyKeyFrom(headers("key with spaces"))).toThrowError(/only letters/);
  });
});

describe("request fingerprinting", () => {
  it("ignores key order, so a reordered retry is still the same request", async () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(await fingerprint("/x", { b: 1, a: 2 })).toBe(await fingerprint("/x", { a: 2, b: 1 }));
  });

  it("distinguishes different bodies and different endpoints", async () => {
    expect(await fingerprint("/x", { a: 1 })).not.toBe(await fingerprint("/x", { a: 2 }));
    expect(await fingerprint("/x", { a: 1 })).not.toBe(await fingerprint("/y", { a: 1 }));
  });

  it("treats an omitted field and an explicit undefined as the same", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("does not confuse nested structures with their flattened text", () => {
    expect(stableStringify({ a: { b: 1 } })).not.toBe(stableStringify({ "a.b": 1 }));
  });
});

describe("withIdempotency", () => {
  const endpoint = "POST /api/v1/households";

  it("runs the operation once and replays the recorded response", async () => {
    const store = memoryStore();
    const operation = vi.fn(async () => ({ status: 201, body: { id: "h-1" } }));

    const first = await withIdempotency(store, { key: "retry-key-0001", endpoint, body: { name: "Home" } }, operation);
    const second = await withIdempotency(store, { key: "retry-key-0001", endpoint, body: { name: "Home" } }, operation);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(second.body).toEqual({ id: "h-1" });
  });

  it("refuses a reused key carrying a different body instead of hiding the bug", async () => {
    const store = memoryStore();
    const operation = vi.fn(async () => ({ status: 201, body: { id: "h-1" } }));

    await withIdempotency(store, { key: "retry-key-0001", endpoint, body: { name: "Home" } }, operation);

    await expect(
      withIdempotency(store, { key: "retry-key-0001", endpoint, body: { name: "Different" } }, operation),
    ).rejects.toThrowError(/already used with a different request body/);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("treats the same key on a different endpoint as a different operation", async () => {
    const store = memoryStore();
    const operation = vi.fn(async () => ({ status: 201, body: { ok: true } }));

    await withIdempotency(store, { key: "shared-key-0001", endpoint, body: {} }, operation);
    await withIdempotency(
      store,
      { key: "shared-key-0001", endpoint: "POST /api/v1/invitations/accept", body: {} },
      operation,
    );

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure, so a retry can genuinely retry", async () => {
    const store = memoryStore();
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ status: 500, body: { error: "boom" } })
      .mockResolvedValueOnce({ status: 201, body: { id: "h-1" } });

    const failed = await withIdempotency(store, { key: "retry-key-0002", endpoint, body: {} }, operation);
    expect(failed.status).toBe(500);
    expect(store.size()).toBe(0);

    const retried = await withIdempotency(store, { key: "retry-key-0002", endpoint, body: {} }, operation);
    expect(retried.status).toBe(201);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("runs normally when the caller sends no key", async () => {
    const store = memoryStore();
    const operation = vi.fn(async () => ({ status: 201, body: { ok: true } }));

    await withIdempotency(store, { key: null, endpoint, body: {} }, operation);
    await withIdempotency(store, { key: null, endpoint, body: {} }, operation);

    expect(operation).toHaveBeenCalledTimes(2);
    expect(store.size()).toBe(0);
  });

  it("runs normally when no store is available", async () => {
    const operation = vi.fn(async () => ({ status: 201, body: { ok: true } }));
    const response = await withIdempotency(null, { key: "some-key-0001", endpoint, body: {} }, operation);
    expect(response.status).toBe(201);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
