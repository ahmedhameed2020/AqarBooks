import type { EInvoiceAdapter, Jurisdiction } from "./types";
import { etaAdapter } from "./adapters/eta";
import { zatcaAdapter } from "./adapters/zatca";

// Single lookup from jurisdiction to adapter. The service layer resolves an
// adapter here and never branches on jurisdiction again -- if a `if
// (jurisdiction === ...)` appears anywhere outside lib/einvoice/adapters, the
// seam has been breached and the next country becomes expensive again.
const ADAPTERS: Partial<Record<Jurisdiction, EInvoiceAdapter>> = {
  EG_ETA: etaAdapter,
  SA_ZATCA: zatcaAdapter,
  // AE_PEPPOL: not yet. The UAE mandate is phased in from 2026 and is expected
  // to follow the Peppol 5-corner model, which routes through an accredited
  // service provider rather than a direct authority API. That is a different
  // enough shape that guessing at it now would be inventing requirements.
};

export function getEInvoiceAdapter(jurisdiction: Jurisdiction): EInvoiceAdapter {
  const adapter = ADAPTERS[jurisdiction];
  if (!adapter) {
    throw new Error(`EINVOICE_JURISDICTION_UNSUPPORTED: ${jurisdiction}`);
  }
  return adapter;
}

export function supportedJurisdictions(): Jurisdiction[] {
  return Object.keys(ADAPTERS) as Jurisdiction[];
}
