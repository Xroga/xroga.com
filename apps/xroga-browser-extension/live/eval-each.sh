#!/usr/bin/env bash
# Runs each eval task in its own autorun (one Chromium, one report per task), so one slow task cannot lose the others' results.
#   live/eval-each.sh <out.jsonl> <timeoutSeconds> <extra-args-json-without-braces> task1 task2 ...
# Needs CHROME_PATH, NB_LIVE=1 and OPENAI_API_KEY in the environment, and a built .output/autorun.
out="$1"; tmo="$2"; extra="$3"; shift 3
for task in "$@"; do
  args="{\"kind\":\"openai-compatible\",\"model\":\"deepseek-v4.1-flash-1017\",\"baseUrl\":\"https://api.zurelay.com/v1\",\"contextWindow\":64000,\"modes\":[\"auto\"],${extra}\"tasks\":[\"${task}\"]}"
  timeout $((tmo + 90)) node fixtures/autorun.mjs eval ${EV_BUILD:---no-build} --timeout "$tmo" --args "$args" > /dev/null 2>&1
  python - "$out" "$task" <<'EOF'
import json, glob, os, sys, time
out, task = sys.argv[1], sys.argv[2]
f = sorted(glob.glob('fixtures/.results/*eval.json'), key=os.path.getmtime)[-1]
d = json.load(open(f, encoding='utf8'))
rows = []
if d.get('reports'):
    for r in d['reports'][0]['result']['runs']:
        rows.append({'task': r['task'], 'success': r['success'], 'turns': r['turns'], 'ms': r['ms'], 'tokens': r['tokens'], 'timing': r.get('timing'),
                     'calls': [c.split(' ')[0] for c in r['calls']], 'probe': (r.get('probe') or '')[:20000], 'answerTail': (r.get('answer') or '')[:400], 'regionCalls': sum('"region"' in c for c in r['calls'])})
else:
    rows.append({'task': task, 'success': False, 'timeout': True})
with open(out, 'a', encoding='utf8') as fh:
    for row in rows:
        fh.write(json.dumps(row) + '\n')
EOF
done
