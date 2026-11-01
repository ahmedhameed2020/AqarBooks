"""PROTOTYPE of the proposed RLS speed-up, in the scratch database `scratch_rls` ONLY (a copy of the isolated stack). Nothing here touches the stack's policies.
Step 1 records which rows each principal sees under the CURRENT policies; step 2 applies the set-based policies; step 3 compares both directions and times count(*).
   python rls_prototype.py -> prototype-result.md"""
import subprocess, uuid, re, os, json
C = "supabase_db_aqarbooks_clean"; DB = "scratch_rls"; here = os.path.dirname(os.path.abspath(__file__))
def psql(sql):
    r = subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",DB,"-tA","-v","ON_ERROR_STOP=1"],input=sql,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1500])
    return r.stdout
pr = [l.strip().split("|") for l in open(os.path.join(here,"..","task8-views","principals.txt"))]
users = [(k,u) for u,_,k,_ in pr]
extra = psql("""select 'invited_or_suspended', om.user_id from organization_memberships om where om.status <> 'active' limit 4;
select 'platform_admin', ura.user_id from user_role_assignments ura join roles r on r.id=ura.role_id where ura.organization_id is null and r.key='PLATFORM_SUPER_ADMIN' limit 2;""")
for l in extra.splitlines():
    if "|" in l: k,u = l.split("|"); users.append((k,u))
users.append(("stranger", str(uuid.uuid4())))
TABLES = ["chart_of_accounts","fiscal_periods","dues"]
KEYS = {}
for t,pol in (("chart_of_accounts","chart_of_accounts_select_permission"),("fiscal_periods","fiscal_periods_select_permission")):
    KEYS[t] = psql(f"select pg_get_expr(polqual, polrelid) from pg_policy where polname='{pol}'").strip()
def visible(uid, t): return f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);"
# ---- step 1: current policies
psql("create schema if not exists cmp; drop table if exists cmp.ids; create table cmp.ids(phase text, tbl text, uid uuid, id uuid); grant all on schema cmp to authenticated; grant all on cmp.ids to authenticated;")
def record(phase):
    for kind, uid in users:
        for t in TABLES:
            psql(visible(uid,t)+f"insert into cmp.ids select '{phase}', '{t}', '{uid}'::uuid, id from public.{t};commit;")
record("old")
# ---- timings with current policies
def timing(tag):
    out = {}
    for kind, uid in (("staff", users[0][1]), ("stranger", users[-1][1])):
        for t in TABLES:
            ts = []
            for _ in range(3):
                o = psql(visible(uid,t)+f"explain (analyze,timing off,summary on) select count(*) from public.{t};rollback;")
                ts.append(float(re.search(r"Execution Time: ([\d.]+)",o).group(1)))
            out[(kind,t)] = (min(ts), max(ts))
    return out
t_old = timing("old")
# ---- step 2: the proposed policies (scratch only)
psql("""
create or replace function public.orgs_with_permission_keys(p_keys text[]) returns setof uuid
language sql stable security definer set search_path to 'public' as $f$
  -- the caller's own organizations (identity only from auth.uid()) where an ACTIVE membership and a tenant-scoped role hold any listed key;
  -- same authority model as has_permission() / has_any_permission(); platform admins are handled in the policy, as in those functions.
  select om.organization_id from public.organization_memberships om
   where auth.uid() is not null and om.user_id = auth.uid() and om.status = 'active'
     and exists (select 1 from public.user_role_assignments ura
                  join public.roles r on r.id = ura.role_id
                  join public.role_permissions rp on rp.role_id = r.id
                  join public.permissions p on p.id = rp.permission_id
                 where ura.user_id = auth.uid() and ura.organization_id = om.organization_id and p.key = any (p_keys)
                   and (r.organization_id = om.organization_id or (r.organization_id is null and r.key <> 'PLATFORM_SUPER_ADMIN')));
$f$;
revoke all on function public.orgs_with_permission_keys(text[]) from public, anon;
grant execute on function public.orgs_with_permission_keys(text[]) to authenticated, service_role;
""")
def keys_of(expr): return re.search(r"ARRAY\[(.*?)\]\)", expr, re.S).group(0)[:-1]
ca = keys_of(KEYS["chart_of_accounts"]); fp = keys_of(KEYS["fiscal_periods"])
admin = "(auth.uid() is not null and public.is_platform_admin(auth.uid()))"
psql(f"""
alter policy chart_of_accounts_select_permission on public.chart_of_accounts using ({admin} or organization_id in (select public.orgs_with_permission_keys({ca})));
alter policy chart_of_accounts_manage on public.chart_of_accounts using (({admin} or organization_id in (select public.orgs_with_permission_keys(array['finance.accounts.manage']))) and public.organization_is_active(organization_id));
alter policy fiscal_periods_select_permission on public.fiscal_periods using ({admin} or organization_id in (select public.orgs_with_permission_keys({fp})));
alter policy fiscal_periods_manage on public.fiscal_periods using (({admin} or organization_id in (select public.orgs_with_permission_keys(array['finance.periods.manage']))) and public.organization_is_active(organization_id));
alter policy dues_select_permission on public.dues using ({admin} or organization_id in (select public.orgs_with_permission_keys(array['finance.dues.read'])));
""")
record("new")
t_new = timing("new")
# ---- step 3: compare
res = []
for t in TABLES:
    a = psql(f"select count(*) from (select uid,id from cmp.ids where phase='new' and tbl='{t}' except all select uid,id from cmp.ids where phase='old' and tbl='{t}') x").strip()
    b = psql(f"select count(*) from (select uid,id from cmp.ids where phase='old' and tbl='{t}' except all select uid,id from cmp.ids where phase='new' and tbl='{t}') x").strip()
    n = psql(f"select count(*) from cmp.ids where phase='old' and tbl='{t}'").strip()
    res.append((t,a,b,n))
rows = ["| table | rows seen by all principals (old) | rows only in NEW | rows only in OLD |","|---|---|---|---|"]+[f"| {t} | {n} | {a} | {b} |" for t,a,b,n in res]
tm = ["| table | principal | current policy ms (min-max) | set-based policy ms (min-max) |","|---|---|---|---|"]+[f"| {t} | {k} | {t_old[(k,t)][0]:.0f}-{t_old[(k,t)][1]:.0f} | {t_new[(k,t)][0]:.0f}-{t_new[(k,t)][1]:.0f} |" for (k,t) in t_old]
kinds = {}
for k,_ in users: kinds[k] = kinds.get(k,0)+1
txt = "# PROTOTYPE in scratch_rls (a copy of the isolated stack; the stack's policies were not touched)\n\nPrincipals compared: " + ", ".join(f"{v} x {k}" for k,v in kinds.items()) + "\n\n## Same rows? (visible ids per principal and table, old vs new, both directions)\n" + "\n".join(rows) + "\n\n## Time of `select count(*)` under RLS\n" + "\n".join(tm) + "\n"
open(os.path.join(here,"prototype-result.md"),"w",encoding="utf-8").write(txt); print(txt)
