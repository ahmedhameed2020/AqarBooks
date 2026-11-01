"""Read-only timing of the reads that the failing permission tests make, per principal, under RLS (isolated stack).
   python rls_probe.py -> probe-tables.md.   Each cell: min / max of 3 `explain (analyze)` executions in ms, and the rows the principal sees.
   Principals: a staff member (permitted in its own organization), an owner (portal member), and a stranger (random user: no membership at all)."""
import subprocess, uuid, re, os
C = "supabase_db_aqarbooks_clean"; here = os.path.dirname(os.path.abspath(__file__))
def psql(sql, db="postgres"):
    r = subprocess.run(["docker","exec","-i",C,"psql","-U","postgres","-d",db,"-tA","-v","ON_ERROR_STOP=1"],input=sql,capture_output=True,text=True,encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:800])
    return r.stdout
pr = [l.strip().split("|") for l in open(os.path.join(here,"..","task8-views","principals.txt"))]
staff = next(p for p in pr if p[2]=="staff"); owner = next(p for p in pr if p[2]=="owner")
stranger = str(uuid.uuid4())
RELS = os.environ.get("PROBE_RELS","chart_of_accounts,fiscal_years,fiscal_periods,journal_entry_lines,members,units,properties,dues,payments,payment_allocations,units_with_financials,members_with_financials").split(",")
tot = {r: int(psql(f"select count(*) from public.{r}").strip()) for r in RELS}
def run(uid, rel):
    ts = []; seen = None
    for _ in range(3):
        o = psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);explain (analyze,timing off,summary on) select count(*) from public.{rel};rollback;")
        ts.append(float(re.search(r"Execution Time: ([\d.]+)",o).group(1)))
    o = psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);select count(*) from public.{rel};rollback;")
    seen = int([l for l in o.splitlines() if re.fullmatch(r"\d+", l.strip())][-1])
    return min(ts), max(ts), seen
rows = ["| relation | total rows | staff ms (min-max) / sees | owner ms / sees | stranger ms / sees |","|---|---|---|---|---|"]
for r in RELS:
    cells = []
    for uid in (staff[0], owner[0], stranger):
        lo, hi, seen = run(uid, r); cells.append(f"{lo:.0f}-{hi:.0f} / {seen}")
    rows.append(f"| {r} | {tot[r]} | " + " | ".join(cells) + " |"); print(rows[-1], flush=True)
open(os.path.join(here,os.environ.get("PROBE_OUT","probe-tables.md")),"w",encoding="utf-8").write("# Time of `select count(*)` per relation under RLS (ms), isolated stack, 839 organizations\n\n"+"\n".join(rows)+"\n")
