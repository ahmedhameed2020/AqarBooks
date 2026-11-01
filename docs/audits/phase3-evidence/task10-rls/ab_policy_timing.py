"""Interleaved old-vs-new policy timing on FULL copies that carry ONLY the policy under test (scratch_rls; the stack is not touched).
A,B,A,B,... alternation so machine load affects both equally.   python ab_policy_timing.py -> ab-policy-timing.md"""
import subprocess, re, os, uuid, statistics
C="supabase_db_aqarbooks_clean"; DB="scratch_rls"; here=os.path.dirname(os.path.abspath(__file__))
def psql(sql, tA=True):
    r=subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",DB,"-tA","-v","ON_ERROR_STOP=1"],input=sql,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1200])
    return r.stdout
pr=[l.strip().split("|") for l in open(os.path.join(here,"..","task8-views","principals.txt"))]
staff=next(p for p in pr if p[2]=="staff")[0]; owner=next(p for p in pr if p[2]=="owner")[0]; stranger=str(uuid.uuid4())
# policies as they were BEFORE the migration (hard-coded) and as installed now (read from the catalog)
OLD={"coa":("has_any_permission(organization_id, ARRAY['finance.accounts.view'::text,'finance.reports.read'::text,'finance.entries.create'::text,'finance.dues.issue'::text,'receivables.dues.create'::text,'receivables.payments.create'::text,'finance.expenses.read'::text,'finance.suppliers.read'::text,'finance.assets.read'::text,'finance.assets.manage'::text,'finance.service_charges.read'::text,'finance.service_charges.manage'::text,'finance.einvoice.read'::text,'finance.einvoice.manage'::text,'finance.commissions.read'::text,'finance.commissions.manage'::text,'finance.budgets.manage'::text,'banking.accounts.view'::text,'cashier.transactions.read'::text,'operations.maintenance.costs.manage'::text,'operations.maintenance.costs.post'::text,'operations.maintenance.owner_charge'::text,'property.leases.manage'::text,'property.installments.manage'::text])","(has_permission(auth.uid(), organization_id, 'finance.accounts.manage'::text) AND organization_is_active(organization_id))","public.chart_of_accounts"),
     "fp":("has_any_permission(organization_id, ARRAY['finance.periods.manage'::text,'finance.reports.read'::text,'finance.accounts.view'::text,'finance.payments.read'::text,'receivables.payments.create'::text,'finance.dues.read'::text,'finance.dues.issue'::text,'finance.expenses.read'::text,'finance.suppliers.read'::text,'finance.einvoice.read'::text,'finance.assets.read'::text,'finance.entries.create'::text,'banking.accounts.view'::text,'cashier.transactions.read'::text,'operations.maintenance.costs.post'::text,'finance.budgets.manage'::text])","(has_permission(auth.uid(), organization_id, 'finance.periods.manage'::text) AND organization_is_active(organization_id))","public.fiscal_periods"),
     "dues":("has_permission(auth.uid(), organization_id, 'finance.dues.read'::text)",None,"public.dues")}
NEWPOL={"coa":("chart_of_accounts_select_permission","chart_of_accounts_manage"),"fp":("fiscal_periods_select_permission","fiscal_periods_manage"),"dues":("dues_select_permission",None)}
psql("drop schema if exists ab cascade; create schema ab; grant usage on schema ab to authenticated;")
for t,(sel,man,src) in OLD.items():
    for v in ("old","new"):
        psql(f"create table ab.{t}_{v} as select * from {src}; alter table ab.{t}_{v} enable row level security; grant select on ab.{t}_{v} to authenticated;")
    psql(f"create policy p_sel on ab.{t}_old for select using ({sel});")
    if man: psql(f"create policy p_man on ab.{t}_old for all using ({man}) with check ({man});")
    for pol,kind in zip(NEWPOL[t],("sel","man")):
        if not pol: continue
        q=psql(f"set search_path=pg_catalog; select pg_get_expr(polqual,polrelid) from pg_policy where polname='{pol}'").strip().splitlines()[-1]
        if kind=="sel": psql(f"create policy p_sel on ab.{t}_new for select using ({q});")
        else: psql(f"create policy p_man on ab.{t}_new for all using ({q}) with check ({q});")
def t(uid,tbl):
    o=psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);explain (analyze,timing off,summary on) select count(*) from ab.{tbl};rollback;")
    return float(re.search(r"Execution Time: ([\d.]+)",o).group(1))
rows=["| table (copy with ONLY this policy) | rows | principal | old policy ms (median of 5) | new policy ms (median of 5) |","|---|---|---|---|---|"]
for tb in ("coa","fp","dues"):
    n=psql(f"select count(*) from ab.{tb}_old").strip()
    for who,uid in (("staff",staff),("owner",owner),("stranger",stranger)):
        a=[];b=[]
        for _ in range(5): a.append(t(uid,f"{tb}_old")); b.append(t(uid,f"{tb}_new"))
        rows.append(f"| {tb} | {n} | {who} | {statistics.median(a):.0f} ({min(a):.0f}-{max(a):.0f}) | {statistics.median(b):.0f} ({min(b):.0f}-{max(b):.0f}) |"); print(rows[-1],flush=True)
open(os.path.join(here,"ab-policy-timing.md"),"w",encoding="utf-8").write("# Interleaved old-vs-new policy timing (full copies carrying only the policy under test; A,B alternated; scratch_rls)\n\n"+"\n".join(rows)+"\n")
