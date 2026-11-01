"""Old-vs-new view definitions on IDENTICAL data, in the scratch clone `scratch_ab` only (never the stack).
One organization is grown with realistic structure (copies of its units, members, ownerships, dues, payments: ~6.5 dues per unit), and at each
size the same staff-session queries are timed (min of 3, ms) and their buffers counted, first with the pre-migration view definitions, then
with the migrated ones.  python ab.py -> ab-scaling.md
Limit: allocations are not copied (a copied payment has no journal entry, so payment_receipt_entry_status would exclude them): the paid-totals
path is measured only on the original organization's payments."""
import subprocess, re, statistics
C = "supabase_db_aqarbooks_clean"; DB = "scratch_ab"
here = __file__.replace("\\", "/").rsplit("/", 1)[0]
def psql(sql, file=None):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "postgres", "-d", DB, "-tA", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True, encoding="utf-8")
    if r.returncode: raise SystemExit(r.stderr[:2000])
    return r.stdout
U, O = open(f"{here}/principals.txt").readline().split("|")[:2]
NEW = None
old_sql = open(f"{here}/old-views.sql", encoding="utf-8").read()
new_sql = open(f"{here}/../../../../supabase/migrations/20261017100800_phase3i_view_lateral_aggregates.sql", encoding="utf-8").read()
def use(which): psql(old_sql if which == "old" else new_sql)
def grow(k0, k1):
    psql(f"""set session_replication_role=replica;
create temp table um as select u.id old_id, g, gen_random_uuid() new_id from public.units u, generate_series({k0+1},{k1}) g where u.organization_id='{O}' and u.id in (select id from public.units where organization_id='{O}' and code not like '%~%');
create temp table mm as select m.id old_id, g, gen_random_uuid() new_id from public.members m, generate_series({k0+1},{k1}) g where m.organization_id='{O}' and m.id in (select id from public.members where organization_id='{O}' and full_name not like '%~%');
insert into public.units select (jsonb_populate_record(null::public.units, to_jsonb(u) || jsonb_build_object('id', um.new_id, 'code', u.code||'~'||um.g))).* from public.units u join um on um.old_id=u.id;
insert into public.members select (jsonb_populate_record(null::public.members, to_jsonb(m) || jsonb_build_object('id', mm.new_id, 'full_name', m.full_name||'~'||mm.g, 'user_id', null, 'email', null))).* from public.members m join mm on mm.old_id=m.id;
insert into public.unit_ownerships select (jsonb_populate_record(null::public.unit_ownerships, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'unit_id', um.new_id, 'member_id', mm.new_id))).* from public.unit_ownerships o join um on um.old_id=o.unit_id join mm on mm.old_id=o.member_id and mm.g=um.g where o.organization_id='{O}';
insert into public.dues select (jsonb_populate_record(null::public.dues, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid(), 'unit_id', um.new_id))).* from public.dues d join um on um.old_id=d.unit_id where d.organization_id='{O}';
analyze public.units; analyze public.members; analyze public.unit_ownerships; analyze public.dues;""")
def counts(): return psql(f"select (select count(*) from units where organization_id='{O}'),(select count(*) from dues where organization_id='{O}'),(select count(*) from members where organization_id='{O}')").strip()
member = psql(f"select m.id from public.members m where organization_id='{O}' and full_name like '%~1' order by full_name limit 1").strip() if False else None
def ids():
    m = psql(f"select id from public.members where organization_id='{O}' order by created_at limit 1").strip()
    u = psql(f"select string_agg(unit_id::text, ',') from public.unit_ownerships where member_id='{m}'").strip()
    return m, u
def run(q):
    ts, bufs = [], None
    for _ in range(3):
        s = psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{U}\",\"role\":\"authenticated\"}}',true);explain (analyze,buffers,timing off,summary on) {q};rollback;")
        ts.append(float(next(l.split(":")[1].split()[0] for l in s.splitlines() if l.startswith("Execution Time"))))
        if bufs is None:
            bufs = int(next(re.search(r"shared hit=(\d+)", l).group(1) for l in s.splitlines() if "shared hit=" in l))  # first (top) node
    return min(ts), bufs
rows = ["| size | query | old ms | new ms | old buffers | new buffers |", "|---|---|---|---|---|---|"]
cur = 0
for k in (0, 50, 200, 750):
    if k > cur: grow(cur, k); cur = k
    m, u = ids()
    Q = {
     "Q2 one member": f"select * from public.members_with_financials where id='{m}' and organization_id='{O}'",
     "Q1 one member's units": f"select * from public.units_with_financials where id = any('{{{u}}}'::uuid[])",
     "Q3 25 units (list page)": f"select * from public.units_with_financials where organization_id='{O}' and archived_at is null order by code limit 25",
     "Q4/Q5 ALL units of the org (KPI)": f"select occupancy_status, balance from public.units_with_financials where organization_id='{O}'",
     "Q6 25 members (list page)": f"select * from public.members_with_financials where organization_id='{O}' order by full_name limit 25",
     "ALL members of the org (KPI)": f"select units_count,total_balance from public.members_with_financials where organization_id='{O}'",
    }
    res = {}
    for which in ("old", "new"):
        use(which)
        for name, q in Q.items(): res[(which, name)] = run(q)
    cnt = counts().split("|")
    for name in Q:
        o, n = res[("old", name)], res[("new", name)]
        rows.append(f"| {cnt[0]} units / {cnt[1]} dues / {cnt[2]} members | {name} | {o[0]:.0f} | {n[0]:.0f} | {o[1]} | {n[1]} |")
        print(rows[-1], flush=True)
txt = "# old vs new view definitions, same data (scratch_ab, 1 organization, staff session under RLS; min of 3 runs; buffers = top-node shared hits)\n\n" + "\n".join(rows) + "\n"
open(f"{here}/ab-scaling.md", "w", encoding="utf-8").write(txt)
