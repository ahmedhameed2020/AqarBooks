"""Second A/B pass at the final size of scratch_ab after the migration was reshaped (single pass over dues). python ab2.py -> ab-final.md"""
import subprocess, re
C="supabase_db_aqarbooks_clean"; DB="scratch_ab"
here=__file__.replace("\\","/").rsplit("/",1)[0]
def psql(s):
    r=subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",DB,"-tA","-v","ON_ERROR_STOP=1"],input=s,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1500])
    return r.stdout
U,O=open(f"{here}/principals.txt").readline().split("|")[:2]
old=open(f"{here}/old-views.sql",encoding="utf-8").read(); new=open(f"{here}/../../../../supabase/migrations/20261017100800_phase3i_view_lateral_aggregates.sql",encoding="utf-8").read()
m=psql(f"select id from public.members where organization_id='{O}' order by created_at limit 1").strip()
u=psql(f"select string_agg(unit_id::text, ',') from public.unit_ownerships where member_id='{m}'").strip()
Q={"Q2 one member":f"select * from public.members_with_financials where id='{m}' and organization_id='{O}'",
"Q1 one member's units":f"select * from public.units_with_financials where id = any('{{{u}}}'::uuid[])",
"Q3 25 units (list page)":f"select * from public.units_with_financials where organization_id='{O}' and archived_at is null order by code limit 25",
"Q4/Q5 ALL units of the org (KPI)":f"select occupancy_status, balance from public.units_with_financials where organization_id='{O}'",
"Q6 25 members (list page)":f"select * from public.members_with_financials where organization_id='{O}' order by full_name limit 25",
"ALL members of the org (KPI)":f"select units_count,total_balance from public.members_with_financials where organization_id='{O}'"}
def run(q):
    ts=[];b=None
    for _ in range(3):
        s=psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{U}\",\"role\":\"authenticated\"}}',true);explain (analyze,buffers,timing off,summary on) {q};rollback;")
        ts.append(float(next(l.split(":")[1].split()[0] for l in s.splitlines() if l.startswith("Execution Time"))))
        if b is None: b=int(next(re.search(r"shared hit=(\d+)",l).group(1) for l in s.splitlines() if "shared hit=" in l))
    return min(ts),b
res={}
for w,sql in (("old",old),("new",new)):
    psql(sql)
    for n,q in Q.items(): res[(w,n)]=run(q)
cnt=psql(f"select (select count(*) from units where organization_id='{O}'),(select count(*) from dues where organization_id='{O}'),(select count(*) from members where organization_id='{O}')").strip()
rows=["| query | old ms | new ms | old buffers | new buffers |","|---|---|---|---|---|"]+[f"| {n} | {res[('old',n)][0]:.0f} | {res[('new',n)][0]:.0f} | {res[('old',n)][1]} | {res[('new',n)][1]} |" for n in Q]
t=f"# FINAL shape: old vs new on identical data, scratch_ab ({cnt} = units|dues|members), staff session under RLS, min of 3\n\n"+"\n".join(rows)+"\n"
open(f"{here}/ab-final.md","w",encoding="utf-8").write(t); print(t)
