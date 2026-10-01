import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGateFixture, sql } from "./helpers/gate-release";

describe("gate completion concurrent authenticated scanners", () => {
  it("returns the same event and creates exactly one owner notification and hardware command", async () => {
    const fixture = await createGateFixture();
    const visitor = fixture.invitation(), device = fixture.device();
    const scan = {
      p_device_id: device.id, p_device_credential: device.credential, p_gate_id: fixture.gate,
      p_invitation_id: visitor.id, p_raw_secret: visitor.secret, p_direction: "ENTRY", p_client_scan_id: randomUUID(),
    };
    const results = await Promise.all([
      fixture.guard.client.rpc("process_visitor_gate_scan", scan),
      fixture.manager.client.rpc("process_visitor_gate_scan", scan),
    ]);
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ decision: "ALLOW", reason_code: "VALID_ENTRY" });
      expect(result.data[0].event_id).toMatch(/^[0-9a-f-]{36}$/);
    }
    const ids = new Set(results.map((result) => result.data[0].event_id));
    expect(ids.size).toBe(1);
    const event = [...ids][0];
    expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("1");
    expect(sql(`select count(*) from public.gate_hardware_commands where access_event_id='${event}'`)).toBe("1");
    expect(sql(`select count(*) from public.notifications where source_id='${event}' and recipient_user_id='${fixture.owner.id}' and type='VISITOR_ENTERED'`)).toBe("1");
    expect(sql(`select entry_count||'|'||exit_count||'|'||is_inside from public.visitor_access_state where visitor_invitation_id='${visitor.id}'`)).toBe("1|0|true");
  }, 60_000);
});
