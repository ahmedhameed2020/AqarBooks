#!/bin/bash
# Two `supabase db diff` started ~10 s apart on the SAME stack project folder (same fixed shadow port).  usage: drift_concurrent.sh <label>
cd /d/Web/AqarBooks/docs/audits/phase3-evidence/task9-drift
L=$1; SD="C:/Users/Lenovo/AppData/Local/Temp/aqarbooks-clean-stack"
docker events --filter type=container --format '{{.Time}} {{.Action}} {{.Actor.Attributes.name}} img={{.Actor.Attributes.image}} exit={{.Actor.Attributes.exitCode}}' > events-$L.txt 2>&1 & EP=$!
run() { S=$(date +%s); supabase db diff --local --schema public -o json --workdir "$SD" > out-$L-$1.json 2> err-$L-$1.txt; echo "rc=$? $(( $(date +%s)-S ))s" > rc-$L-$1.txt; }
run A & sleep 10; run B & wait %2 %3 2>/dev/null; wait
sleep 2; kill $EP 2>/dev/null; echo DONE > done-$L.txt
