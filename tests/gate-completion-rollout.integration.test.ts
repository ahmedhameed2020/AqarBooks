import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGateFixture, sql } from "./helpers/gate-release";

describe("completion rollout and non-destructive rollback", () => {
  it("isolates manager policy, fences scan paths and preserves evidence/devices", async () => {
    const f = await createGateFixture(false);
    expect((await f.manager.client.rpc("gate_completion_enabled", { p_organization_id: f.org })).data).toBe(false);
    expect((await f.manager.client.rpc("gate_completion_enabled", { p_organization_id: randomUUID() })).data).toBe(false);
    // This fixture deliberately enables completion; migration itself opts no tenant in.
    expect((await f.manager.client.rpc("set_gate_completion_policy", { p_organization_id: f.org, p_enabled: true })).error).toBeNull();
    const device = f.device(), visitor = f.invitation();
    const legacy = { p_gate_id: f.gate, p_invitation_id: visitor.id, p_raw_secret: visitor.secret, p_direction: "ENTRY", p_client_scan_id: randomUUID() };
    const trusted = { ...legacy, p_device_id: device.id, p_device_credential: device.credential };
    expect((await f.guard.client.rpc("process_visitor_gate_scan", legacy)).error?.message).toContain("GATE_TRUSTED_DEVICE_REQUIRED");
    expect((await f.guard.client.rpc("process_visitor_gate_scan_core", legacy)).error).not.toBeNull();
    const admitted = await f.guard.client.rpc("process_visitor_gate_scan", trusted);
    expect(admitted.error).toBeNull(); expect(admitted.data?.[0].decision).toBe("ALLOW");
    const originalEvent = admitted.data?.[0].event_id;
    const manual = await f.guard.client.rpc("create_gate_manual_exception", { p_gate_id: f.gate, p_invitation_id: visitor.id, p_direction: "ENTRY", p_outcome: "DENIED", p_category: "OTHER", p_reason: "retained evidence" });
    expect(manual.error).toBeNull();
    expect((await f.manager.client.rpc("approve_gate_manual_exception", { p_exception_id: manual.data, p_reason: "verified evidence" })).error).toBeNull();
    const reconciled = f.invitation();
    expect((await f.manager.client.rpc("reconcile_visitor_access_state", { p_gate_id: f.gate, p_invitation_id: reconciled.id, p_is_inside: true, p_category: "MISSED_SCAN", p_reason: "verified occupancy" })).error).toBeNull();
    const retainedSupervision = sql(`select (select count(*) from public.gate_manual_exceptions where organization_id='${f.org}')||'|'||(select count(*) from public.gate_access_reconciliations where organization_id='${f.org}')`);
    expect(retainedSupervision).toBe("2|1");
    const snapshot = sql(`select (select count(*) from public.gate_devices where organization_id='${f.org}')||'|'||(select count(*) from public.access_events where organization_id='${f.org}')||'|'||(select count(*) from public.gate_hardware_commands where organization_id='${f.org}')`);
    expect((await f.guard.client.rpc("set_gate_completion_policy", { p_organization_id: f.org, p_enabled: false })).error).not.toBeNull();
    const other = await createGateFixture();
    expect((await f.manager.client.rpc("set_gate_completion_policy", { p_organization_id: other.org, p_enabled: false })).error).not.toBeNull();
    expect((await f.manager.client.from("gate_completion_policy").select("organization_id").eq("organization_id", other.org)).data).toEqual([]);
    expect((await f.manager.client.rpc("set_gate_completion_policy", { p_organization_id: f.org, p_enabled: false })).error).toBeNull();
    expect(sql(`select (select count(*) from public.gate_devices where organization_id='${f.org}')||'|'||(select count(*) from public.access_events where organization_id='${f.org}')||'|'||(select count(*) from public.gate_hardware_commands where organization_id='${f.org}')`)).toBe(snapshot);
    expect(sql(`select (select count(*) from public.gate_manual_exceptions where organization_id='${f.org}')||'|'||(select count(*) from public.gate_access_reconciliations where organization_id='${f.org}')`)).toBe(retainedSupervision);
    expect(sql(`select public.gate_hardware_event_eligible('${originalEvent}',endpoint_id) from public.gate_hardware_commands where access_event_id='${originalEvent}'`)).toBe("f");
    expect((await f.guard.client.rpc("process_visitor_gate_scan", { ...trusted, p_direction: "EXIT", p_client_scan_id: randomUUID() })).error?.message).toContain("GATE_COMPLETION_DISABLED");
    expect((await f.manager.client.rpc("create_gate_device_enrollment", { p_gate_id: f.gate, p_direction: "BOTH", p_code_hash: "a".repeat(64), p_expires_at: new Date(Date.now()+600_000).toISOString() })).error?.message).toContain("GATE_COMPLETION_DISABLED");
    expect((await f.guard.client.rpc("create_gate_manual_exception", { p_gate_id: f.gate, p_invitation_id: visitor.id, p_direction: "ENTRY", p_outcome: "DENIED", p_category: "OTHER", p_reason: "rollback test" })).error?.message).toContain("GATE_COMPLETION_DISABLED");
    const exit = { ...legacy, p_direction: "EXIT", p_client_scan_id: randomUUID() };
    expect((await f.owner.client.rpc("process_visitor_gate_scan", exit)).error).not.toBeNull();
    const compatible = await f.guard.client.rpc("process_visitor_gate_scan", exit);
    expect(compatible.error).toBeNull(); expect(compatible.data?.[0].decision).toBe("ALLOW");
    expect(sql(`select public.gate_operations_enabled('${f.org}')`)).toBe("t");
    expect(sql(`select status from public.gate_devices where id='${device.id}'`)).toBe("ACTIVE");
  }, 120_000);
});
