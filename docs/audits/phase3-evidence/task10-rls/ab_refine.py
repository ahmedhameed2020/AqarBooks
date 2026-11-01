"""Interleaved timing: policies as installed by migration 20261017100900 (A) vs the refined admin check (B), full copies carrying only the policy under test (scratch_rls)."""
import subprocess, re, os, uuid, statistics
C="supabase_db_aqarbooks_clean"; DB="scratch_rls"; here=os.path.dirname(os.path.abspath(__file__))
def psql(sql):
    r=subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",DB,"-tA","-v","ON_ERROR_STOP=1"],input=sql,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1200])
    return r.stdout
pr=[l.strip().split("|") for l in open(os.path.join(here,"..","task8-views","principals.txt"))]
staff=next(p for p in pr if p[2]=="staff")[0]; owner=next(p for p in pr if p[2]=="owner")[0]; stranger=str(uuid.uuid4())
T={"coa":("public.chart_of_accounts",("chart_of_accounts_select_permission","chart_of_accounts_manage")),"fp":("public.fiscal_periods",("fiscal_periods_select_permission","fiscal_periods_manage")),"dues":("public.dues",("dues_select_permission",None))}
def expr(pol): return psql(f"set search_path=pg_catalog; select pg_get_expr(polqual,polrelid) from pg_policy where polname='{pol}'").strip().splitlines()[-1]
def make(tag):
    for t,(src,pols) in T.items():
        psql(f"create table ab.{t}_{tag} as select * from {src}; alter table ab.{t}_{tag} enable row level security; grant select on ab.{t}_{tag} to authenticated;")
        for pol,kind in zip(pols,("sel","man")):
            if pol:
                q=expr(pol)
                psql(f"create policy p_{kind} on ab.{t}_{tag} for {'select' if kind=='sel' else 'all'} using ({q})"+(f" with check ({q})" if kind=='man' else "")+";")
psql("drop schema if exists ab cascade; create schema ab; grant usage on schema ab to authenticated;")
make("a")                                   # policies as installed by the migration
psql(open(os.path.join(here,"migration","refinement-prototype.sql"),encoding="utf-8").read())   # refine the real policies in scratch_rls
make("b")
def tm(uid,tbl):
    o=psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);explain (analyze,timing off,summary on) select count(*) from ab.{tbl};rollback;")
    return float(re.search(r"Execution Time: ([\d.]+)",o).group(1))
rows=["| table | rows | principal | migration policies ms (median of 5) | refined ms (median of 5) |","|---|---|---|---|---|"]
for t in T:
    n=psql(f"select count(*) from ab.{t}_a").strip()
    for who,uid in (("staff",staff),("owner",owner),("stranger",stranger)):
        a=[];b=[]
        for _ in range(5): a.append(tm(uid,f"{t}_a")); b.append(tm(uid,f"{t}_b"))
        rows.append(f"| {t} | {n} | {who} | {statistics.median(a):.0f} ({min(a):.0f}-{max(a):.0f}) | {statistics.median(b):.0f} ({min(b):.0f}-{max(b):.0f}) |"); print(rows[-1],flush=True)
open(os.path.join(here,"ab-refinement.md"),"w",encoding="utf-8").write("# Interleaved timing: policies as installed (A) vs admin check as InitPlan (B); scratch_rls, full copies with only the policy under test\n\n"+"\n".join(rows)+"\n")
