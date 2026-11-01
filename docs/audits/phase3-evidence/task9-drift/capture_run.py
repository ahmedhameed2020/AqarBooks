"""One real `supabase db diff` (the one `stack.mjs verify` takes) while the CLI's transient SHADOW database and the LIVE stack database are each
read straight from the PostgreSQL catalogs with catalog_snapshot.sql (independent of migra).  No image is pulled, nothing is written to a database.
   python capture_run.py <label>   ->  cap-<label>.{diff.json,err.txt,live.cat,shadow.cat,catdiff.txt,summary.txt}
The snapshot of the shadow is taken as soon as the CLI prints "Diffing schemas" (all migrations applied, shadow still alive)."""
import subprocess, sys, time, re, os, shutil
C = "supabase_db_aqarbooks_clean"; SD = "C:/Users/Lenovo/AppData/Local/Temp/aqarbooks-clean-stack"
here = os.path.dirname(os.path.abspath(__file__)); label = sys.argv[1]
snap = open(os.path.join(here, "catalog_snapshot.sql"), encoding="utf-8").read()
out_dir = os.environ.get("CAPTURE_OUT_DIR", here); os.makedirs(out_dir, exist_ok=True)   # outputs go here (verify points it at its own folder)
def dexec(name, sql):
    r = subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True, encoding="utf-8")
    return r.returncode, r.stdout, r.stderr
def shadow_name():
    out = subprocess.run(["docker", "ps", "--format", "{{.Names}}|{{.Image}}"], capture_output=True, text=True).stdout.splitlines()
    c = [l.split("|")[0] for l in out if re.fullmatch(r"[a-z]+_[a-z]+", l.split("|")[0]) and "supabase/postgres" in l]
    return c[0] if len(c) == 1 else None
out = open(os.path.join(out_dir, f"cap-{label}.diff.json"), "w", encoding="utf-8"); err_path = os.path.join(out_dir, f"cap-{label}.err.txt")
t0 = time.time()
p = subprocess.Popen(["supabase", "db", "diff", "--local", "--schema", "public", "-o", "json", "--workdir", SD], stdout=out, stderr=open(err_path, "w", encoding="utf-8"), shell=True)
shadow = None; live_rc = shadow_rc = None; note = ""
while p.poll() is None:
    time.sleep(1)
    if shadow is None and "Diffing schemas" in open(err_path, encoding="utf-8", errors="replace").read():
        name = shadow_name()
        if not name: note += "shadow container not identified; "; shadow = "none"; continue
        rc_s, so, se = dexec(name, snap)
        open(os.path.join(out_dir, f"cap-{label}.shadow.cat"), "w", encoding="utf-8").write(so); shadow_rc = rc_s
        rc_l, lo, le = dexec(C, snap)
        open(os.path.join(out_dir, f"cap-{label}.live.cat"), "w", encoding="utf-8").write(lo); live_rc = rc_l
        shadow = name
        if rc_s: note += "shadow snapshot error: " + se[:200] + "; "
p.wait(); out.close(); dur = int(time.time() - t0)
raw = open(os.path.join(out_dir, f"cap-{label}.diff.json"), encoding="utf-8", errors="replace").read()
kind = "TOOL-ERROR(rc=%d)" % p.returncode if p.returncode else "clean"
if not p.returncode:
    import json
    j = json.loads(raw[raw.find("{"):]); kind = "clean" if not j.get("diff", "").strip() and not j.get("dropStatements") else "DIFFERS"
catdiff = "n/a"
lp, sp = (os.path.join(out_dir, f"cap-{label}.live.cat"), os.path.join(out_dir, f"cap-{label}.shadow.cat"))
if os.path.exists(lp) and os.path.exists(sp):
    a = open(lp, encoding="utf-8").read().splitlines(); b = open(sp, encoding="utf-8").read().splitlines()
    import difflib
    d = list(difflib.unified_diff(a, b, "live", "shadow", lineterm="", n=0))
    open(os.path.join(out_dir, f"cap-{label}.catdiff.txt"), "w", encoding="utf-8").write("\n".join(d))
    catdiff = f"{len([x for x in d if x.startswith(('+','-')) and not x.startswith(('+++','---'))])} differing lines; live={len(a)} shadow={len(b)} lines"
open(os.path.join(out_dir, f"cap-{label}.summary.txt"), "w", encoding="utf-8").write(f"label={label} duration={dur}s cli={kind} catalog_compare={catdiff} {note}\n")
import json as _j
_n = None
if catdiff != "n/a": _n = len([x for x in d if x.startswith(("+","-")) and not x.startswith(("+++","---"))])
open(os.path.join(out_dir, f"cap-{label}.result.json"), "w", encoding="utf-8").write(_j.dumps({"cli": kind, "returncode": p.returncode, "catalog_diff_lines": _n, "live_lines": (len(a) if _n is not None else None), "shadow_lines": (len(b) if _n is not None else None), "duration_s": dur, "note": note}))
print(open(os.path.join(out_dir, f"cap-{label}.summary.txt"), encoding="utf-8").read().strip())
