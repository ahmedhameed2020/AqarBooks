"""Baseline (or re-check) of the numbers the two views produce, on the ISOLATED stack only.

  python baseline.py before   -> writes baseline-before.txt
  python baseline.py after    -> writes baseline-after.txt  (then diff the two)

Two parts:
 1. as the table owner (no RLS): one md5 per view row, and per-organization sums -- the numbers themselves;
 2. as `authenticated` with the JWT claims of 8 staff and 8 owner principals (principals.txt): what each of them sees through RLS
    (row count + md5 of the figures that matter), so that a change of scope or of arithmetic shows up.
"""
import subprocess, sys, hashlib

CONTAINER = "supabase_db_aqarbooks_clean"
tag = sys.argv[1] if len(sys.argv) > 1 else "before"
here = __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0] if ("\\" in __file__ or "/" in __file__) else "."

UNITS_COLS = "id::text||'|'||coalesce(owner_id::text,'-')||'|'||occupancy_status||'|'||total_due::text||'|'||total_paid::text||'|'||balance::text||'|'||has_arrears::text||'|'||coalesce(archived_at::text,'-')||'|'||code"
MEMBERS_COLS = "id::text||'|'||units_count::text||'|'||total_balance::text||'|'||has_arrears::text||'|'||coalesce(last_payment_amount::text,'-')||'|'||coalesce(last_payment_date::text,'-')||'|'||coalesce(archived_at::text,'-')||'|'||full_name"

def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(r.stderr)
    return r.stdout

out = []
out.append(f"# baseline {tag}")
# ---- 1. owner view of the data (no RLS)
out.append("## per-view totals and a single md5 over every row")
out.append(psql(f"select 'units_with_financials', count(*), md5(string_agg({UNITS_COLS}, E'\\n' order by id)) from public.units_with_financials").strip())
out.append(psql(f"select 'members_with_financials', count(*), md5(string_agg({MEMBERS_COLS}, E'\\n' order by id)) from public.members_with_financials").strip())
out.append("## per-organization sums (units view): org | units | total_due | total_paid | balance")
out.append(psql("select organization_id, count(*), sum(total_due), sum(total_paid), sum(balance) from public.units_with_financials group by 1 order by 1").strip())
out.append("## per-organization sums (members view): org | members | units_count | total_balance")
out.append(psql("select organization_id, count(*), sum(units_count), sum(total_balance) from public.members_with_financials group by 1 order by 1").strip())

# ---- 2. what each principal sees through RLS
out.append("## through RLS: kind | user | org | units rows | units md5 | members rows | members md5")
for line in open(f"{here}/principals.txt", encoding="utf-8"):
    uid, oid, kind, _email = line.strip().split("|")[:4]
    sql = f"""begin;
set local role authenticated;
select set_config('request.jwt.claims','{{"sub":"{uid}","role":"authenticated"}}',true);
select '{kind}|{uid}|{oid}|' || (select count(*)::text||'|'||coalesce(md5(string_agg({UNITS_COLS}, E'\\n' order by id)),'-') from public.units_with_financials)
   || '|' || (select count(*)::text||'|'||coalesce(md5(string_agg({MEMBERS_COLS}, E'\\n' order by id)),'-') from public.members_with_financials);
rollback;"""
    out.append([l for l in psql(sql).splitlines() if l.startswith(kind + "|")][0])
text = "\n".join(out) + "\n"
open(f"{here}/baseline-{tag}.txt", "w", encoding="utf-8").write(text)
print(tag, "lines:", len(text.splitlines()), "sha256:", hashlib.sha256(text.encode()).hexdigest()[:16])
