import { execFile } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createGateFixture, sql, type GateFixture } from "./helpers/gate-release";
const actionDb = vi.hoisted(() => ({ client: null as GateFixture["guard"]["client"] | null }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => actionDb.client }));
import { redeemGateDeviceEnrollmentAction } from "@/lib/actions/gate-devices";

function peer(query: string): Promise<string> {
  return new Promise((resolve,reject) => execFile("docker", ["exec","supabase_db_aqarbooks","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-tA","-c",query],
    {timeout:30_000}, (error,stdout,stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout)));
}
async function waitFor(query: string, value: string) {
  const deadline=Date.now()+10_000;
  while(Date.now()<deadline) { if(sql(query)===value) return; await new Promise((r)=>setTimeout(r,50)); }
  throw new Error("Database lock checkpoint not reached");
}
describe.sequential("final gate cross-contract regressions",()=>{
  let f: GateFixture;
  beforeAll(async()=>{ f=await createGateFixture(); },60_000);
  const asActor=(actor:string,query:string)=>`begin; set local role authenticated; set local request.jwt.claim.sub='${actor}'; ${query}; commit;`;
  function scan(device: ReturnType<GateFixture["device"]>, visitor: ReturnType<GateFixture["invitation"]>, scanId=randomUUID()) {
    return f.guard.client.rpc("process_visitor_gate_scan",{p_device_id:device.id,p_device_credential:device.credential,p_gate_id:f.gate,
      p_invitation_id:visitor.id,p_raw_secret:visitor.secret,p_direction:"ENTRY",p_client_scan_id:scanId,p_scanner_version:"2026-10-01"});
  }
  it("a revoker holding the device lock wins over a waiting scan",async()=>{
    const d=f.device(),v=f.invitation(),app=`revoke-${randomUUID()}`;
    const revoke=peer(`set application_name='${app}'; ${asActor(f.manager.id,`select public.revoke_gate_device('${d.id}','Lost device'); select pg_sleep(3)`)}`);
    await waitFor(`select wait_event from pg_stat_activity where application_name='${app}'`,"PgSleep");
    const result=await scan(d,v);
    await revoke;
    expect(result.error?.message).toBe("DEVICE_BINDING_NOT_AUTHORIZED");
    expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${v.id}'`)).toBe("0");
  },60_000);
  it("attributes the original event once and returns safe hardware status on replay",async()=>{
    const d=f.device(),other=f.device(),v=f.invitation(),key=randomUUID();
    const original=await scan(d,v,key); expect(original.error).toBeNull();
    expect(original.data[0].hardware_status).toBe("QUEUED");
    const replay=await scan(other,v,key); expect(replay.error).toBeNull();
    expect(replay.data[0].event_id).toBe(original.data[0].event_id);
    expect(replay.data[0].hardware_status).toBe("QUEUED");
    expect(sql(`select device_id from public.gate_scan_devices where access_event_id='${original.data[0].event_id}'`)).toBe(d.id);
    expect(()=>sql(`update public.gate_scan_devices set device_id='${other.id}' where access_event_id='${original.data[0].event_id}'`)).toThrow(/IMMUTABLE/);
    const metrics=JSON.parse(sql(`select public.gate_scan_telemetry('${f.org}')`));
    expect(metrics.sampleSize).toBeGreaterThan(0); expect(metrics.validationP95Ms).toBeGreaterThanOrEqual(0);
    expect(metrics.dimensions[0].scanner_version).toBe("2026-10-01");
  });
  it("actual enrollment action rotates the same installation and sign-out release invalidates the current credential",async()=>{
    actionDb.client=f.guard.client;
    async function code() {
      const raw=randomBytes(32).toString("base64url");
      const r=await f.manager.client.rpc("create_gate_device_enrollment",{p_gate_id:f.gate,p_direction:"BOTH",p_code_hash:(await import("./helpers/gate-release")).hash(raw),p_expires_at:new Date(Date.now()+14*60_000).toISOString()});
      expect(r.error).toBeNull(); return {enrollmentId:r.data as string,code:raw,displayName:"Rotating scanner"};
    }
    const first=await redeemGateDeviceEnrollmentAction(await code()); expect(first.ok).toBe(true); if(!first.ok) throw Error("enroll");
    const second=await redeemGateDeviceEnrollmentAction({...await code(),installationId:first.installationId}); expect(second.ok).toBe(true); if(!second.ok) throw Error("rotate");
    expect(second.deviceId).toBe(first.deviceId); expect(second.deviceCredential).not.toBe(first.deviceCredential);
    const v=f.invitation();
    expect((await scan({id:first.deviceId,credential:first.deviceCredential},v)).error?.message).toBe("DEVICE_BINDING_NOT_AUTHORIZED");
    expect((await scan({id:second.deviceId,credential:second.deviceCredential},v)).data[0].decision).toBe("ALLOW");
    const release=await f.guard.client.rpc("release_gate_device",{p_device_id:second.deviceId,p_credential:second.deviceCredential}); expect(release.error).toBeNull();
    expect((await scan({id:second.deviceId,credential:second.deviceCredential},f.invitation())).error?.message).toBe("DEVICE_BINDING_NOT_AUTHORIZED");
  });
  it("outbox INSERT failure retains ALLOW and recovers once from immutable evidence",async()=>{
    const d=f.device(),v=f.invitation();
    sql(`create function public.test_gate_enqueue_failure() returns trigger language plpgsql as $$ begin if new.organization_id='${f.org}' then raise exception 'injected outbox failure'; end if; return new; end; $$;
      create trigger test_gate_enqueue_failure before insert on public.gate_notification_outbox for each row execute function public.test_gate_enqueue_failure();`);
    let event:string;
    try {
      const r=await scan(d,v); expect(r.error).toBeNull(); expect(r.data[0].decision).toBe("ALLOW"); event=r.data[0].event_id;
      expect(sql(`select status from public.gate_notification_recovery where source_id='${event}'`)).toBe("PENDING");
      expect(sql(`select is_inside from public.visitor_access_state where visitor_invitation_id='${v.id}'`)).toBe("t");
    } finally { sql("drop trigger test_gate_enqueue_failure on public.gate_notification_outbox; drop function public.test_gate_enqueue_failure()"); }
    sql("select public.process_gate_notifications(100); select public.process_gate_notifications(100)");
    expect(sql(`select count(*) from public.notifications where source_id='${event!}' and type='VISITOR_ENTERED'`)).toBe("1");
    expect(sql(`select status from public.gate_notification_recovery where source_id='${event!}'`)).toBe("RECOVERED");
  });
  it("rollback preserves pending security evidence without delivery and retains legacy entry notifications",async()=>{
    const d=f.device(),v=f.invitation(); const r=await scan(d,v); expect(r.error).toBeNull(); const event=r.data[0].event_id;
    sql(`insert into public.gate_notification_outbox(dedupe_key,organization_id,recipient_user_id,recipient_member_id,type,source_id,body_ar,body_en,action_url)
      select 'gate-alert:'||e.id,e.organization_id,m.user_id,m.id,'VISITOR_SECURITY_ALERT',e.id,'Safe','Safe','/portal/visitors/'||i.id
      from public.access_events e join public.visitor_invitations i on i.id=e.visitor_invitation_id join public.members m on m.id=i.invited_by_member_id where e.id='${event}';`);
    const disabled=await f.manager.client.rpc("set_gate_completion_policy",{p_organization_id:f.org,p_enabled:false}); expect(disabled.error).toBeNull();
    try {
      sql("select public.process_gate_notifications(100)");
      expect(sql(`select status||'|'||attempts from public.gate_notification_outbox where dedupe_key='gate-alert:${event}'`)).toBe("PENDING|0");
      expect(sql(`select public.detect_gate_long_stays(100)`)).toBe("0");
      const fresh=f.invitation();
      const legacy=await f.guard.client.rpc("process_visitor_gate_scan",{p_gate_id:f.gate,p_invitation_id:fresh.id,p_raw_secret:fresh.secret,p_direction:"ENTRY",p_client_scan_id:randomUUID()});
      expect(legacy.error).toBeNull();
      expect(sql(`select count(*) from public.notifications where source_id='${legacy.data[0].event_id}' and type='VISITOR_ENTERED'`)).toBe("1");
    } finally { await f.manager.client.rpc("set_gate_completion_policy",{p_organization_id:f.org,p_enabled:true}); }
  });
  it("fresh authorized lookup supports missing-entry reconciliation with separate durable audit",async()=>{
    const v=f.invitation();
    const found=await f.manager.client.rpc("lookup_gate_reconciliation_invitation",{p_gate:f.gate,p_query:v.id});
    expect(found.error).toBeNull(); expect(found.data[0].id).toBe(v.id);
    const denied=await f.guard.client.rpc("lookup_gate_reconciliation_invitation",{p_gate:f.gate,p_query:v.id}); expect(denied.error).not.toBeNull();
    const r=await f.manager.client.rpc("reconcile_visitor_access_state",{p_gate_id:f.gate,p_invitation_id:v.id,p_is_inside:true,p_category:"MISSED_SCAN",p_reason:"Supervised manual entry"});
    expect(r.error).toBeNull();
    expect(sql(`select is_inside from public.visitor_access_state where visitor_invitation_id='${v.id}'`)).toBe("t");
    expect(sql(`select count(*) from public.platform_audit_logs where entity_id='${r.data}' and action='gate_access.reconciled'`)).toBe("1");
  });
  it("a rollback holding its lock first prevents a waiting security notification delivery",async()=>{
    const d=f.device(),v=f.invitation(); const r=await scan(d,v); expect(r.error).toBeNull(); const event=r.data[0].event_id;
    sql(`insert into public.gate_notification_outbox(dedupe_key,organization_id,recipient_user_id,recipient_member_id,type,source_id,body_ar,body_en,action_url)
      select 'gate-alert:'||e.id,e.organization_id,m.user_id,m.id,'VISITOR_SECURITY_ALERT',e.id,'Safe','Safe','/portal/visitors/'||i.id
      from public.access_events e join public.visitor_invitations i on i.id=e.visitor_invitation_id join public.members m on m.id=i.invited_by_member_id where e.id='${event}';`);
    const app=`rollback-notification-${randomUUID()}`;
    const rollback=peer(`set application_name='${app}'; ${asActor(f.manager.id,`select public.set_gate_completion_policy('${f.org}',false); select pg_sleep(3)`)}`);
    await waitFor(`select wait_event from pg_stat_activity where application_name='${app}'`,"PgSleep");
    try {
      await peer(`select public.deliver_gate_notification('gate-alert:${event}')`); await rollback;
      expect(sql(`select status||'|'||attempts from public.gate_notification_outbox where dedupe_key='gate-alert:${event}'`)).toBe("PENDING|0");
      expect(sql(`select count(*) from public.notifications where source_id='${event}' and type='VISITOR_SECURITY_ALERT'`)).toBe("0");
    } finally { await rollback; await f.manager.client.rpc("set_gate_completion_policy",{p_organization_id:f.org,p_enabled:true}); }
  },60_000);
  it("pre-opt-in organizations cannot enqueue completion security alerts, while new narrow permissions are enforced",async()=>{
    const off=await createGateFixture(false),v=off.invitation();
    const legacy=await off.guard.client.rpc("process_visitor_gate_scan",{p_gate_id:off.gate,p_invitation_id:v.id,p_raw_secret:v.secret,p_direction:"ENTRY",p_client_scan_id:randomUUID()});
    expect(legacy.error).toBeNull(); const event=legacy.data[0].event_id;
    sql(`select public.enqueue_gate_notification('${off.org}','${v.id}','${off.gate}','VISITOR_SECURITY_ALERT','${event}','PROPERTY_MISMATCH',now())`);
    expect(sql(`select count(*) from public.gate_notification_outbox where dedupe_key='gate-alert:${event}'`)).toBe("0");
    const d=f.device();
    sql(`delete from public.role_permissions where role_id='${f.manager.id}' and permission_id=(select id from public.permissions where key='operations.gates.devices.manage')`);
    try {
      expect((await f.manager.client.rpc("revoke_gate_device",{p_device_id:d.id,p_reason:"Test narrow grant"})).error?.message).toBe("GATE_DEVICE_NOT_AUTHORIZED");
    } finally { sql(`insert into public.role_permissions(role_id,permission_id) select '${f.manager.id}',id from public.permissions where key='operations.gates.devices.manage'`); }
    expect((await f.manager.client.rpc("revoke_gate_device",{p_device_id:d.id,p_reason:"Test narrow grant"})).error).toBeNull();
  },60_000);
});
