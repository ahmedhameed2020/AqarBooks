"""Wait / lock monitoring while the page queries run on the ISOLATED stack (read-only). python waits.py -> waits-stack.txt"""
import subprocess, threading, time, collections
C = "supabase_db_aqarbooks_clean"
here = __file__.replace("\\", "/").rsplit("/", 1)[0]
def psql(sql, db="postgres"):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "postgres", "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True, encoding="utf-8")
    return r.stdout
prin = [l.strip().split("|") for l in open(f"{here}/principals.txt")]
staff = next(p for p in prin if p[2] == "staff"); owner = next(p for p in prin if p[2] == "owner")
member = psql(f"select id from public.members where organization_id='{staff[1]}' order by created_at limit 1").strip()
units = psql(f"select string_agg(id::text, ',') from public.units where organization_id='{staff[1]}'").strip()
work = [(staff[0], f"select * from public.members_with_financials where id='{member}'"),
        (staff[0], f"select * from public.units_with_financials where id = any('{{{units}}}'::uuid[])"),
        (owner[0], "select id,code,balance from public.units_with_financials")]
samples = collections.Counter(); locks = collections.Counter(); n_sample = [0]; stop = [False]
def sampler():
    while not stop[0]:
        out = psql("""select coalesce(wait_event_type,'CPU/none')||':'||coalesce(wait_event,'-'), state from pg_stat_activity
                      where datname='postgres' and backend_type='client backend' and pid<>pg_backend_pid() and state='active' and query ilike '%_with_financials%' and query not ilike '%pg_stat_activity%'""")
        for l in out.splitlines(): samples[l.split("|")[0]] += 1
        lk = psql("select count(*) from pg_locks where not granted")
        locks[lk.strip()] += 1; n_sample[0] += 1
t = threading.Thread(target=sampler); t.start()
t0 = time.time(); runs = 0
for _ in range(8):
    for uid, q in work:
        psql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true);{q};rollback;"); runs += 1
stop[0] = True; t.join()
txt = [f"# waits/locks while {runs} page queries ran on the stack ({time.time()-t0:.0f}s wall), {n_sample[0]} samples of pg_stat_activity (active view queries) and pg_locks",
       "wait_event samples of active view queries (CPU/none = running on CPU, no wait):"] + [f"  {k}: {v}" for k, v in samples.most_common()] + \
      ["samples by number of NOT GRANTED locks (key = count):"] + [f"  {k}: {v}" for k, v in sorted(locks.items())]
open(f"{here}/waits-stack.txt", "w").write("\n".join(txt) + "\n"); print("\n".join(txt))
