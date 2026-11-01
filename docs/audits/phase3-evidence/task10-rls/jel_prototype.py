"""journal_entry_lines: where the cost is and what a rewrite buys. Scratch copies only (scratch_rls); NOTHING is applied to the stack.
 A = current: lines policy (EXISTS over journal_entries + has_any_permission) over journal_entries WITH ITS CURRENT per-row policy
 B = proposal: lines policy rewritten set-based, journal_entries policy left as it is
 C = B plus journal_entries' own select policy rewritten set-based (a different table: shown only to size the dependency, NOT proposed here)
Interleaved A,B,C,A,B,C... median of 5.   python jel_prototype.py -> jel-prototype.md"""
import subprocess, re, os, uuid, statistics
C="supabase_db_aqarbooks_clean"; DB="scratch_rls"; here=os.path.dirname(os.path.abspath(__file__))
def psql(sql):
    r=subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",DB,"-tA","-v","ON_ERROR_STOP=1"],input=sql,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1500])
    return r.stdout
pr=[l.strip().split("|") for l in open(os.path.join(here,"..","task8-views","principals.txt"))]
staff=next(p for p in pr if p[2]=="staff")[0]; owner=next(p for p in pr if p[2]=="owner")[0]; stranger=str(uuid.uuid4())
K="ARRAY['finance.reports.read'::text,'finance.entries.create'::text,'finance.entries.review'::text,'finance.accounts.view'::text,'finance.audit.read'::text]"
ADMIN="(SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))"
OLD_LINES=lambda je: f"EXISTS (SELECT 1 FROM {je} je WHERE je.id = journal_entry_id AND public.has_any_permission(je.organization_id, {K}))"
NEW_LINES=lambda je: f"journal_entry_id IN (SELECT je.id FROM {je} je WHERE {ADMIN} OR je.organization_id IN (SELECT public.orgs_with_permission_keys({K})))"
JE_OLD="(public.has_permission(auth.uid(), organization_id, 'finance.reports.read'::text) OR public.has_permission(auth.uid(), organization_id, 'finance.entries.create'::text))"
JE_NEW=f"({ADMIN} OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.reports.read'::text,'finance.entries.create'::text])))"
psql("drop schema if exists jel cascade; create schema jel; grant usage on schema jel to authenticated;")
for t,src in (("je_a","public.journal_entries"),("je_c","public.journal_entries"),("l_a","public.journal_entry_lines"),("l_b","public.journal_entry_lines"),("l_c","public.journal_entry_lines")):
    psql(f"create table jel.{t} as select * from {src}; alter table jel.{t} enable row level security; grant select on jel.{t} to authenticated;")
psql(f"create policy p on jel.je_a for select using ({JE_OLD}); create policy p on jel.je_c for select using ({JE_NEW});")
psql(f"create policy p on jel.l_a for select using ({OLD_LINES('jel.je_a')}); create policy p on jel.l_b for select using ({NEW_LINES('jel.je_a')}); create policy p on jel.l_c for select using ({NEW_LINES('jel.je_c')});")
def tm(uid,t):
    o=psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);explain (analyze,timing off,summary on) select count(*) from jel.{t};rollback;")
    return float(re.search(r"Execution Time: ([\d.]+)",o).group(1))
n=psql("select count(*) from jel.l_a").strip()
rows=[f"| principal | A current | B lines policy rewritten | C B + journal_entries policy rewritten |","|---|---|---|---|"]
for who,uid in (("staff",staff),("owner",owner),("stranger",stranger)):
    r={"l_a":[],"l_b":[],"l_c":[]}
    for _ in range(5):
        for k in r: r[k].append(tm(uid,k))
    rows.append(f"| {who} | "+" | ".join(f"{statistics.median(r[k]):.0f} ({min(r[k]):.0f}-{max(r[k]):.0f})" for k in ("l_a","l_b","l_c"))+" |"); print(rows[-1],flush=True)
open(os.path.join(here,"jel-prototype.md"),"w",encoding="utf-8").write(f"# journal_entry_lines: interleaved timing, median of 5 (min-max), ms; full copies ({n} lines) on scratch_rls\n\n"+"\n".join(rows)+"\n")
