import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Local-only fixtures: never read .env.production or accept a remote override.
export const password = "Gate_Release_Test_P@ssw0rd_2026!";
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function sql(query: string) {
  return execFileSync("docker", ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }).trim();
}
export function localSupabase() {
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  const env = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(env.API_URL ?? "") || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("Release gates require running local Supabase with auth/API and local keys.");
  }
  return env;
}
export async function createGateFixture(completionEnabled = true) {
  const env = localSupabase();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options);
  async function user(label: string) {
    const email = `gate-release-${label}-${randomUUID()}@test.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Fixture user failed: ${created.error?.message}`);
    const client = createClient(env.API_URL, env.ANON_KEY, options);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    return { id: created.data.user.id, email, client };
  }
  const manager = await user("manager"), guard = await user("guard"), owner = await user("owner");
  const org = randomUUID(), property = randomUUID(), gate = randomUUID(), otherGate = randomUUID(), unit = randomUUID(), member = randomUUID();
  sql(`insert into public.organizations(id,name,slug,default_currency,status) values('${org}','Gate Release','${org}','QAR','ACTIVE');
    insert into public.subscriptions(organization_id,plan_id,status) select '${org}',id,'ACTIVE' from public.plans where key='PROFESSIONAL';
    insert into public.organization_memberships(organization_id,user_id) values('${org}','${manager.id}'),('${org}','${guard.id}');
    insert into public.roles(id,organization_id,key,name_ar,name_en) values('${manager.id}','${org}','RELEASE_MANAGER','مدير','Release manager'),('${guard.id}','${org}','RELEASE_GUARD','حارس','Release guard');
    insert into public.role_permissions(role_id,permission_id) select '${manager.id}',id from public.permissions where key like 'operations.%';
    insert into public.role_permissions(role_id,permission_id) select '${guard.id}',id from public.permissions where key in ('operations.gates.scan','operations.gates.exceptions.create','operations.access_events.view');
    insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${manager.id}','${manager.id}'),('${org}','${guard.id}','${guard.id}');
    insert into public.properties(id,organization_id,name,code,timezone,property_type) values('${property}','${org}','Release property','${property}','Asia/Qatar','building');
    insert into public.units(id,organization_id,property_id,code) values('${unit}','${org}','${property}','R-101');
    insert into public.members(id,organization_id,full_name,user_id) values('${member}','${org}','Release host','${owner.id}');
    insert into public.gates(id,organization_id,property_id,code,name_ar,name_en,created_by) values('${gate}','${org}','${property}','NORTH','البوابة الشمالية','North gate','${manager.id}'),('${otherGate}','${org}','${property}','SOUTH','البوابة الجنوبية','South gate','${manager.id}');
    insert into public.gate_completion_policy(organization_id,enabled,updated_by) values('${org}',${completionEnabled},'${manager.id}');
    insert into public.gate_hardware_settings(organization_id,enabled) values('${org}',true);
    insert into public.gate_hardware_endpoints(organization_id,gate_id,adapter,is_active) values('${org}','${gate}','NOOP',true);`);
  function invitation(guest = "Release visitor") {
    const id = randomUUID(), secret = randomUUID();
    const safeGuest = guest.replaceAll("'", "''");
    sql(`insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,valid_from,valid_until,usage_policy,created_by)
      values('${id}','${org}','${property}','${unit}','${member}','${id}','${safeGuest}',now()-interval '1 hour',now()+interval '1 hour','MULTI_USE','${owner.id}');
      insert into public.visitor_invitation_secrets(invitation_id,organization_id,token_hash) values('${id}','${org}','${hash(secret)}');`);
    return { id, secret, payload: `AQP1.${id}.${secret}`, guest };
  }
  function device() {
    const id = randomUUID(), credential = randomUUID();
    sql(`insert into public.gate_devices(id,organization_id,property_id,gate_id,installation_id_hash,credential_hash,display_name,allowed_direction,enrolled_by)
      values('${id}','${org}','${property}','${gate}','${hash(randomUUID())}','${hash(credential)}','Release scanner','BOTH','${manager.id}');`);
    return { id, credential };
  }
  return { org, property, gate, otherGate, manager, guard, owner, invitation, device };
}
export type GateFixture = Awaited<ReturnType<typeof createGateFixture>>;
