"use client";

import { useCallback, useRef, useState } from "react";
import { OperationSubmitter, type SubmitOutcome } from "./operation-submit";

/** Form helper: `pending` for the button, `run(content, call)` for the submit handler, `reset()` when the dialog closes unfinished. */
export function useOperationSubmit() {
  const [pending, setPending] = useState(false);
  const ref = useRef<OperationSubmitter | null>(null);
  if (ref.current === null) ref.current = new OperationSubmitter(setPending);
  const run = useCallback(
    <T extends SubmitOutcome>(content: unknown, call: (operationKey: string) => Promise<T>) => ref.current!.run(content, call),
    [],
  );
  const reset = useCallback(() => ref.current!.reset(), []);
  return { pending, run, reset };
}
