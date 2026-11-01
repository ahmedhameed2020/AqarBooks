import { describe, expect, it } from "vitest";
import { createOperationKeys, fingerprintOf } from "@/lib/finance/operation-key";

const counter = () => {
  let n = 0;
  return () => `key-${++n}`;
};
const content = { paymentId: "p1", allocations: [{ dueId: "d1", amount: 600 }], applicationDate: "2026-09-05" };

describe("operation keys: stable for a retry, new for a new operation", () => {
  it("the same content keeps the same key (timeout, double click, resubmitting an unresolved attempt)", () => {
    const keys = createOperationKeys(counter());
    const first = keys.keyFor(content);
    expect(keys.keyFor(content)).toBe(first);
    expect(keys.keyFor(structuredClone(content))).toBe(first);
    expect(keys.keyFor({ applicationDate: "2026-09-05", allocations: [{ amount: 600, dueId: "d1" }], paymentId: "p1" })).toBe(first); // key order is irrelevant
  });
  it("changed content is a NEW operation: a new key (the server would refuse the old key with other content)", () => {
    const keys = createOperationKeys(counter());
    const first = keys.keyFor(content);
    const edited = keys.keyFor({ ...content, allocations: [{ dueId: "d1", amount: 601 }] });
    expect(edited).not.toBe(first);
    expect(keys.keyFor({ ...content, allocations: [{ dueId: "d1", amount: 601 }] })).toBe(edited); // and that one is stable in turn
  });
  it("after a success the next submission — even with identical content — is a new operation", () => {
    const keys = createOperationKeys(counter());
    const first = keys.keyFor(content);
    keys.complete();
    expect(keys.keyFor(content)).not.toBe(first);
  });
  it("a failure does NOT rotate the key; abandoning the form does", () => {
    const keys = createOperationKeys(counter());
    const first = keys.keyFor(content);
    // ...the attempt failed (network/timeout): nothing is called, the next keyFor for the same content is the retry
    expect(keys.keyFor(content)).toBe(first);
    keys.reset();
    expect(keys.keyFor(content)).not.toBe(first);
  });
  it("two independent forms never share a key; the default factory yields UUIDs", () => {
    const a = createOperationKeys(), b = createOperationKeys();
    const ka = a.keyFor(content), kb = b.keyFor(content);
    expect(ka).not.toBe(kb);
    expect(ka).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("fingerprintOf is order-insensitive for objects and order-sensitive for arrays", () => {
    expect(fingerprintOf({ a: 1, b: [1, 2] })).toBe(fingerprintOf({ b: [1, 2], a: 1 }));
    expect(fingerprintOf({ b: [1, 2] })).not.toBe(fingerprintOf({ b: [2, 1] }));
  });
});
