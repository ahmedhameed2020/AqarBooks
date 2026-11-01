"""Single-organization data cost: grow ONE organization's dues inside the scratch clone (never the stack) and time the page queries.
   python scaling.py   -> scaling-clone-1-org.txt
Synthetic rows are copies of the organization's own dues (same units, new ids); payments/allocations are not scaled (limitation, stated in the report)."""
import subprocess
import sys
C = "supabase_db_aqarbooks_clean"; DB = sys.argv[1] if len(sys.argv) > 1 else "scratch_ref"; OUTNAME = sys.argv[2] if len(sys.argv) > 2 else "scaling-clone-1-org.txt"
here = __file__.replace("\\", "/").rsplit("/", 1)[0]
def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "postgres", "-d", DB, "-tA", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True, encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:1500])
    return r.stdout
U, O = open(f"{here}/principals.txt").readline().split("|")[:2]
member = psql(f"select id from public.members where organization_id='{O}' order by created_at limit 1").strip()
units = psql(f"select string_agg(id::text, ',') from public.units where organization_id='{O}'").strip()
Q = {
 "Q2 member row": f"select * from public.members_with_financials where id='{member}' and organization_id='{O}'",
 "Q1 units of member": f"select * from public.units_with_financials where id = any('{{{units}}}'::uuid[])",
 "Q5 org-wide balances": f"select balance from public.units_with_financials where organization_id='{O}'",
}
def t(q):
    out = []
    for _ in range(3):
        s = psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{U}\",\"role\":\"authenticated\"}}',true);explain (analyze,timing off,buffers off,summary on) {q};rollback;")
        out.append(float(next(l.split(":")[1].split()[0] for l in s.splitlines() if l.startswith("Execution Time"))))
    return min(out), max(out)
lines = ["# single-organization scaling (scratch clone, 1 org, dues replicated) -- staff session under RLS; min..max of 3 runs, ms"]
have = int(psql(f"select count(*) from public.dues where organization_id='{O}'"))
for target in (have, 1000, 5000, 20000):
    if target > have:
        psql(f"""set session_replication_role=replica;
insert into public.dues select (d).* from (select d from public.dues d where organization_id='{O}') x;""" if False else f"""set session_replication_role=replica;
create temp table _src as select * from public.dues where organization_id='{O}' limit 13;
insert into public.dues select (jsonb_populate_record(null::public.dues, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid()))).* from _src s, generate_series(1, {(target - have) // 13 + 1}) g;
analyze public.dues;""")
        have = int(psql(f"select count(*) from public.dues where organization_id='{O}'"))
    row = [f"dues in the organization: {have}"]
    for name, q in Q.items():
        lo, hi = t(q); row.append(f"{name}: {lo:.0f}..{hi:.0f}")
    lines.append(" | ".join(row)); print(lines[-1], flush=True)
open(f"{here}/{OUTNAME}", "w", encoding="utf-8").write("\n".join(lines) + "\n")
