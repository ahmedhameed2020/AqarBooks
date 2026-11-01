"""fiscal_years: current vs proposed policies, full copy carrying only the policy under test, interleaved A,B, median of 5 (scratch_rls only)."""
import subprocess, re, os, uuid, statistics
C="supabase_db_aqarbooks_clean"; DB="scratch_rls"; here=os.path.dirname(os.path.abspath(__file__))
def psql(sql):
    r=subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",DB,"-tA","-v","ON_ERROR_STOP=1"],input=sql,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1200])
    return r.stdout
pr=[l.strip().split("|") for l in open(os.path.join(here,"..","task8-views","principals.txt"))]
staff=next(p for p in pr if p[2]=="staff")[0]; owner=next(p for p in pr if p[2]=="owner")[0]; stranger=str(uuid.uuid4())
K="ARRAY['finance.periods.manage'::text,'finance.reports.read'::text,'finance.accounts.view'::text]"; AD="(SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))"
SEL_OLD=f"public.has_any_permission(organization_id, {K})"
MAN_OLD="(public.has_permission(auth.uid(), organization_id, 'finance.periods.manage'::text) AND public.organization_is_active(organization_id))"
SEL_NEW=f"{AD} OR organization_id IN (SELECT public.orgs_with_permission_keys({K}))"
MAN_NEW=f"(({AD} OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text]))) AND public.organization_is_active(organization_id))"
psql("drop schema if exists fyab cascade; create schema fyab; grant usage on schema fyab to authenticated;")
for t,sel,man in (("a",SEL_OLD,MAN_OLD),("b",SEL_NEW,MAN_NEW)):
    psql(f"create table fyab.fy_{t} as select * from public.fiscal_years; alter table fyab.fy_{t} enable row level security; grant select on fyab.fy_{t} to authenticated; create policy p_sel on fyab.fy_{t} for select using ({sel}); create policy p_man on fyab.fy_{t} for all using ({man}) with check ({man});")
def tm(uid,t):
    o=psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);explain (analyze,timing off,summary on) select count(*) from fyab.fy_{t};rollback;")
    return float(re.search(r"Execution Time: ([\d.]+)",o).group(1))
n=psql("select count(*) from fyab.fy_a").strip()
rows=[f"| principal | current policies ms (median of 5, min-max) | proposed ms |","|---|---|---|"]
for who,uid in (("staff",staff),("owner",owner),("stranger",stranger)):
    a=[];b=[]
    for _ in range(5): a.append(tm(uid,"a")); b.append(tm(uid,"b"))
    rows.append(f"| {who} | {statistics.median(a):.0f} ({min(a):.0f}-{max(a):.0f}) | {statistics.median(b):.0f} ({min(b):.0f}-{max(b):.0f}) |"); print(rows[-1],flush=True)
open(os.path.join(here,"fy-timing.md"),"w",encoding="utf-8").write(f"# fiscal_years ({n} rows), interleaved, scratch_rls, full copy with only the policy under test\n\n"+"\n".join(rows)+"\n")
