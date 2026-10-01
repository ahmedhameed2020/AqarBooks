import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, createClient, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { approveGateManualExceptionAction, createGateManualExceptionAction, reconcileVisitorAccessStateAction } from "../lib/actions/gate-supervision";

const id = "f52d4ebd-d840-49a3-b030-1bdd3685fa69";
const request = { gateId: id, invitationId: id, direction: "ENTRY" as const, outcome: "ENTERED" as const, category: "OTHER" as const, reason: " Recorded by guard " };

describe("gate supervision actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({ rpc });
    rpc.mockResolvedValue({ data: id, error: null });
  });

  it("validates all untrusted inputs before making a database request", async () => {
    expect(await createGateManualExceptionAction({ ...request, reason: " " })).toEqual({ ok: false, error: "invalid_input" });
    expect(await createGateManualExceptionAction({ ...request, outcome: "EXITED" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await approveGateManualExceptionAction({ exceptionId: "invalid", reason: "Review" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await reconcileVisitorAccessStateAction({ gateId: id, invitationId: id, isInside: true, category: "MISSED_SCAN", reason: " " })).toEqual({ ok: false, error: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("uses the authenticated RPC contract and returns only the evidence ID", async () => {
    expect(await createGateManualExceptionAction(request)).toEqual({ ok: true, id });
    expect(rpc).toHaveBeenCalledWith("create_gate_manual_exception", expect.objectContaining({ p_reason: "Recorded by guard", p_outcome: "ENTERED", p_invitation_id: id }));
    expect(await approveGateManualExceptionAction({ exceptionId: id, reason: "Reviewed" })).toEqual({ ok: true, id });
    expect(await reconcileVisitorAccessStateAction({ gateId: id, invitationId: id, isInside: false, category: "MISSED_SCAN", reason: "Observed exit" })).toEqual({ ok: true, id });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/operations/gate/occupancy", "page");
    expect(revalidatePath.mock.calls.filter(([path]) => path === "/[locale]/operations/gate/occupancy")).toHaveLength(3);
    expect(revalidatePath).not.toHaveBeenCalledWith("/[locale]/operations/occupancy", "page");
  });

  it.each([
    ["ENTRY", "ENTERED"], ["EXIT", "EXITED"], ["ENTRY", "DENIED"],
  ] as const)("records unidentified %s/%s evidence with a null invitation", async (direction, outcome) => {
    const input = { gateId: id, direction, outcome, category: "OTHER" as const, reason: "Unidentified visitor" };
    expect(await createGateManualExceptionAction(input)).toEqual({ ok: true, id });
    expect(rpc).toHaveBeenLastCalledWith("create_gate_manual_exception", expect.objectContaining({ p_gate_id: id, p_invitation_id: null, p_direction: direction, p_outcome: outcome }));
    expect(await createGateManualExceptionAction({ ...input, invitationId: null })).toEqual({ ok: true, id });
  });

  it.each([
    ["GATE_SUPERVISION_NOT_AUTHORIZED", "forbidden"],
    ["MANUAL_EXCEPTION_SELF_APPROVAL", "self_approval"],
    ["MANUAL_EXCEPTION_ALREADY_APPROVED", "already_approved"],
    ["RECONCILIATION_STATE_UNCHANGED", "state_unchanged"],
    ["sensitive database detail", "failed"],
  ])("returns a safe error for %s", async (message, error) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await approveGateManualExceptionAction({ exceptionId: id, reason: "Reviewed" })).toEqual({ ok: false, error });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
