import { describe, expect, it, vi } from "vitest";
import { OperationSubmitter } from "@/lib/finance/operation-submit";
import { periodForDate } from "@/lib/finance/customer-advances";

const counter = () => {
  let n = 0;
  return () => `key-${++n}`;
};
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const content = { paymentId: "p1", allocations: [{ dueId: "d1", amount: 600 }], applicationDate: "2026-09-05" };

describe("double submission", () => {
  it("a second submit while the first is in flight is ignored: the server action is called once, with one key", async () => {
    const submitter = new OperationSubmitter(undefined, counter());
    const gate = deferred<{ ok: true }>();
    const call = vi.fn(() => gate.promise);
    const first = submitter.run(content, call);
    expect(submitter.pending).toBe(true);
    // Enter pressed again, the button clicked again, a re-render re-submitting the same form
    expect(await submitter.run(content, call)).toBeNull();
    expect(await submitter.run({ ...content, applicationDate: "2026-09-06" }, call)).toBeNull();
    gate.resolve({ ok: true });
    expect(await first).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("key-1");
    expect(submitter.pending).toBe(false);
  });

  it("reports pending to the UI exactly around the call", async () => {
    const seen: boolean[] = [];
    const submitter = new OperationSubmitter((p) => seen.push(p), counter());
    await submitter.run(content, async () => ({ ok: true as const }));
    expect(seen).toEqual([true, false]);
  });
});

describe("retry key stability", () => {
  it("a failed attempt keeps the key: the retry sends the SAME key, a different failure type changes nothing", async () => {
    const submitter = new OperationSubmitter(undefined, counter());
    const call = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: "unexpected" })      // timeout / server error
      .mockRejectedValueOnce(new Error("fetch failed"))               // the network dropped
      .mockResolvedValueOnce({ ok: true });
    expect(await submitter.run(content, call)).toEqual({ ok: false, error: "unexpected" });
    expect(await submitter.run(content, call)).toEqual({ ok: false, error: "unexpected" });   // a thrown error is reported, not raised
    expect(await submitter.run(content, call)).toEqual({ ok: true });
    expect(call.mock.calls.map((c) => c[0])).toEqual(["key-1", "key-1", "key-1"]);
  });

  it("a business refusal also keeps the key; editing the content (the user fixes the form) starts a new operation", async () => {
    const submitter = new OperationSubmitter(undefined, counter());
    const call = vi.fn().mockResolvedValue({ ok: false, error: "CREDIT_EXCEEDED" });
    await submitter.run(content, call);
    await submitter.run(content, call);
    await submitter.run({ ...content, allocations: [{ dueId: "d1", amount: 400 }] }, call);
    expect(call.mock.calls.map((c) => c[0])).toEqual(["key-1", "key-1", "key-2"]);
  });

  it("success completes the operation: the next submission — even with identical content — gets a new key", async () => {
    const submitter = new OperationSubmitter(undefined, counter());
    const call = vi.fn().mockResolvedValue({ ok: true });
    await submitter.run(content, call);
    await submitter.run(content, call);
    expect(call.mock.calls.map((c) => c[0])).toEqual(["key-1", "key-2"]);
  });

  it("closing the form unfinished (reset) makes the next submission a new operation", async () => {
    const submitter = new OperationSubmitter(undefined, counter());
    const call = vi.fn().mockResolvedValue({ ok: false, error: "unexpected" });
    await submitter.run(content, call);
    submitter.reset();
    await submitter.run(content, call);
    expect(call.mock.calls.map((c) => c[0])).toEqual(["key-1", "key-2"]);
  });

  it("two forms never share a key, and the in-flight lock is per form", async () => {
    const a = new OperationSubmitter(undefined, counter());
    const b = new OperationSubmitter(undefined, () => "other");
    const gate = deferred<{ ok: true }>();
    const first = a.run(content, () => gate.promise);
    const callB = vi.fn().mockResolvedValue({ ok: true });
    expect(await b.run(content, callB)).toEqual({ ok: true });           // another form is not blocked
    expect(callB).toHaveBeenCalledWith("other");
    gate.resolve({ ok: true });
    await first;
  });
});

describe("periodForDate", () => {
  const periods = [{ id: "aug", start: "2026-08-01", end: "2026-08-31" }, { id: "sep", start: "2026-09-01", end: "2026-09-30" }];
  it("picks the monthly period that contains the date, including its first and last day", () => {
    expect(periodForDate(periods, "2026-08-31")?.id).toBe("aug");
    expect(periodForDate(periods, "2026-09-01")?.id).toBe("sep");
    expect(periodForDate(periods, "2026-10-01")).toBeUndefined();
  });
});
