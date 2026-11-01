// One submission at a time, one key per operation.
//
// A form that calls a customer-advance action must (a) refuse a second submission while the first is in flight (double click, Enter
// pressed twice, a slow server) and (b) keep the SAME idempotency key when the user retries after a failure, but use a NEW key for a
// new operation. This class holds both rules without React so that they are unit-tested; use-operation-submit.ts wraps it for forms.
import { createOperationKeys, type KeyFactory } from "./operation-key";

export type SubmitOutcome = { ok: true } | { ok: false; error: string };

export class OperationSubmitter {
  private readonly keys;
  private inFlight = false;

  constructor(
    private readonly onPending: (pending: boolean) => void = () => undefined,
    make?: KeyFactory,
  ) {
    this.keys = createOperationKeys(make);
  }

  get pending(): boolean {
    return this.inFlight;
  }

  /**
   * Runs `call` with the operation key for this exact `content`. Returns null (and calls nothing) when a submission is already in
   * flight. A failure — including a thrown network error — keeps the key, so the next attempt with the same content is a retry the
   * server answers idempotently; success completes the operation, so the next submission gets a new key.
   */
  async run<T extends SubmitOutcome>(content: unknown, call: (operationKey: string) => Promise<T>): Promise<T | { ok: false; error: "unexpected" } | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    this.onPending(true);
    try {
      const key = this.keys.keyFor(content);
      const result = await call(key);
      if (result.ok) this.keys.complete();
      return result;
    } catch {
      return { ok: false, error: "unexpected" };
    } finally {
      this.inFlight = false;
      this.onPending(false);
    }
  }

  /** The user abandoned the form: the next submission is a new operation. */
  reset(): void {
    this.keys.reset();
  }
}
