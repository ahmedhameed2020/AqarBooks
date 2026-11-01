#!/bin/bash
# Like drift_loop.sh, plus (a) optional CPU load from throw-away busybox containers, (b) a poller that samples the transient SHADOW container
# every 2 s (search_path, postgres role config, policy / trigger counts) so an anomalous shadow is caught while it exists.
# usage: drift_loop2.sh <label> <runs> <burners>
cd /d/Web/AqarBooks/docs/audits/phase3-evidence/task9-drift
L=$1; N=$2; B=${3:-0}; SD="C:/Users/Lenovo/AppData/Local/Temp/aqarbooks-clean-stack"
docker events --filter type=container --format '{{.Time}} {{.Action}} {{.Actor.Attributes.name}} exit={{.Actor.Attributes.exitCode}}' > events-$L.txt 2>&1 & EP=$!
BURN=(); for i in $(seq 1 $B); do BURN+=($(docker run -d --rm --cpus 2 busybox sh -c 'while :; do :; done')); done
poll() { while :; do
  for n in $(docker ps --filter ancestor=public.ecr.aws/supabase/postgres:17.6.1.165 --format '{{.Names}}' | grep -E '^[a-z]+_[a-z]+$' | grep -v '^supabase_'); do
    echo "$(date +%H:%M:%S) $n $(docker exec -i $n psql -U postgres -d postgres -tA -F ' ' -c "select current_setting('search_path'), coalesce((select rolconfig::text from pg_roles where rolname='postgres'),'NULL'), (select count(*) from pg_policies where schemaname='public'), (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')" 2>&1 | head -1)" >> shadow-poll-$L.txt
  done; sleep 2; done; }
: > shadow-poll-$L.txt; poll & PP=$!
: > runs-$L.tsv
for i in $(seq 1 $N); do
  S=$(date +%s); supabase db diff --local --schema public -o json --workdir "$SD" > out-$L-$i.json 2> err-$L-$i.txt; RC=$?; E=$(date +%s)
  CLEAN=$(python -c "import json;t=open('out-$L-$i.json').read();j=json.loads(t[t.find('{'):]);print('ERROR' if j.get('_tag')=='Error' else ('clean' if not j.get('diff','').strip() and not j.get('dropStatements') else 'DIFF'))" 2>/dev/null || echo noparse)
  [ $RC -ne 0 ] && CLEAN="ERROR(rc=$RC)" 
  echo -e "$i\t$((E-S))s\trc=$RC\t$CLEAN\talter=$(grep -ci 'alter table' out-$L-$i.json)\tapplied=$(grep -c 'Applying migration' err-$L-$i.txt)\t$(grep -iE 'error|failed|timeout' err-$L-$i.txt | head -1 | cut -c1-120)" >> runs-$L.tsv
  [ "$CLEAN" = "clean" ] && rm -f out-$L-$i.json err-$L-$i.txt
done
kill $PP $EP 2>/dev/null; for c in "${BURN[@]}"; do docker kill $c >/dev/null 2>&1; done
echo LOOP-DONE >> runs-$L.tsv
