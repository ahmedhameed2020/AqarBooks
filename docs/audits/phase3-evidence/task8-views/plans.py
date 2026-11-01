"""EXPLAIN (ANALYZE, BUFFERS) of the queries the real pages send, as `authenticated` with a staff / owner principal's JWT claims (RLS on).

  python plans.py <label> [dbname]   -> writes plans-<label>.txt        (default database: postgres = the isolated stack's)

Isolated stack only. Read-only (every statement runs in a transaction that is rolled back).
"""
import subprocess, sys

CONTAINER = "supabase_db_aqarbooks_clean"
label = sys.argv[1] if len(sys.argv) > 1 else "run"
db = sys.argv[2] if len(sys.argv) > 2 else "postgres"
here = __file__.replace("\\", "/").rsplit("/", 1)[0]

def psql(sql, dbname=db):
    r = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", dbname, "-tA", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(r.stderr[:2000])
    return r.stdout

prin = [l.strip().split("|") for l in open(f"{here}/principals.txt", encoding="utf-8")]
staff = next(p for p in prin if p[2] == "staff")
owner = next(p for p in prin if p[2] == "owner")

def ctx(uid):
    return f"begin;\nset local role authenticated;\nselect set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);\n"

# ids a page would use (read as the table owner, outside RLS)
org = staff[1]
prop = psql(f"select id from public.properties where organization_id='{org}' limit 1").strip()
member = psql(f"select id from public.members where organization_id='{org}' order by created_at limit 1").strip()
units = psql(f"select string_agg(id::text, ',') from public.units where organization_id='{org}'").strip()
owner_member = psql(f"select id from public.members where user_id='{owner[0]}' limit 1").strip()

QUERIES = [
    ("staff", staff[0], "Q1 member page: units of one member (id = ANY)", f"select * from public.units_with_financials where id = any('{{{units}}}'::uuid[])"),
    ("staff", staff[0], "Q2 member page: the member row", f"select * from public.members_with_financials where id='{member}' and organization_id='{org}'"),
    ("staff", staff[0], "Q3 property list page: first 25 units + exact count", f"select * from public.units_with_financials where property_id='{prop}' and archived_at is null order by code limit 25"),
    ("staff", staff[0], "Q4 property KPI strip: every unit's status and balance", f"select occupancy_status, balance from public.units_with_financials where property_id='{prop}' and archived_at is null"),
    ("staff", staff[0], "Q5 members page KPI: every unit balance of the organization", f"select balance from public.units_with_financials where organization_id='{org}'"),
    ("staff", staff[0], "Q6 members list: first 25 members", f"select * from public.members_with_financials where organization_id='{org}' order by full_name limit 25"),
    ("owner", owner[0], "Q7 portal units page: the owner's units (RLS only, no filter)", "select id, code, unit_type, balance from public.units_with_financials order by code"),
    ("owner", owner[0], "Q8 portal home: the owner's member row", f"select units_count, total_balance, last_payment_amount, last_payment_date from public.members_with_financials where id='{owner_member}'"),
]

out = [f"# plans {label} (database {db})", f"principals: staff {staff[0]} org {org} | owner {owner[0]}", ""]
for who, uid, title, q in QUERIES:
    out.append(f"## {title}  [{who}]")
    # plain timing: 3 runs
    times = []
    for _ in range(3):
        t = psql(ctx(uid) + f"explain (analyze, timing off, buffers off, summary on) {q};\nrollback;")
        times.append(next((l.split(":")[1].strip() for l in t.splitlines() if l.strip().startswith("Execution Time")), "?"))
    out.append("execution time, 3 runs: " + " | ".join(times))
    plan = psql(ctx(uid) + f"explain (analyze, buffers, timing off, summary on) {q};\nrollback;")
    lines = [l for l in plan.splitlines() if l.strip() and l.strip() not in ("BEGIN", "ROLLBACK", "SET") and "set_config" not in l and not l.startswith("{")]
    out.extend(lines[:60])
    out.append("")
text = "\n".join(out) + "\n"
open(f"{here}/plans-{label}.txt", "w", encoding="utf-8").write(text)
print(label, "->", f"plans-{label}.txt", len(text.splitlines()), "lines")
for blk in text.split("\n## ")[1:]:
    head = blk.splitlines()[0]
    tm = next((l for l in blk.splitlines() if l.startswith("execution time")), "")
    print("  ", head[:70], "|", tm)
