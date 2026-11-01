#!/bin/bash
# Repeats the exact `supabase db diff` that `stack.mjs verify` takes, N times, on the isolated stack's project folder.
# Per run: duration, exit code, clean / differing, statement counts, and whether a shadow-related error was printed.
# `docker events` is captured for the whole loop (container start/die/oom/kill/health).  usage: drift_loop.sh <label> <runs>
cd /d/Web/AqarBooks/docs/audits/phase3-evidence/task9-drift
L=$1; N=$2; SD="C:/Users/Lenovo/AppData/Local/Temp/aqarbooks-clean-stack"
docker events --filter type=container --format '{{.Time}} {{.Action}} {{.Actor.Attributes.name}} img={{.Actor.Attributes.image}} exit={{.Actor.Attributes.exitCode}}' > events-$L.txt 2>&1 &
EP=$!
: > runs-$L.tsv
for i in $(seq 1 $N); do
  S=$(date +%s)
  supabase db diff --local --schema public -o json --workdir "$SD" > out-$L-$i.json 2> err-$L-$i.txt; RC=$?
  E=$(date +%s)
  CLEAN=$(python -c "import json,sys;j=json.loads(open('out-$L-$i.json').read()[open('out-$L-$i.json').read().find('{'):]);print('clean' if not j.get('diff','').strip() and not j.get('dropStatements') else 'DIFF')" 2>/dev/null || echo "noparse")
  ALT=$(grep -ci "alter table" out-$L-$i.json); APPL=$(grep -c "Applying migration" err-$L-$i.txt)
  echo -e "$i\t$((E-S))s\trc=$RC\t$CLEAN\talter=$ALT\tapplied=$APPL\t$(grep -iE 'error|failed|timeout' err-$L-$i.txt | head -1 | cut -c1-120)" >> runs-$L.tsv
  [ "$CLEAN" = "clean" ] && rm -f out-$L-$i.json
done
kill $EP 2>/dev/null
echo LOOP-DONE >> runs-$L.tsv
