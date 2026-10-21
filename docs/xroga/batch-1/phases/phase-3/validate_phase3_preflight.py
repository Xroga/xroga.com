#!/usr/bin/env python3
"""Read-only source-of-truth preflight for Xroga Batch1 Phase3.

Usage: python docs/xroga/batch-1/phases/phase-3/validate_phase3_preflight.py --repo .
This is NOT an acceptance evaluator, security scan or proof of implemented code.
"""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,sys

def sha256(b):return hashlib.sha256(b).hexdigest()
def norm(s):return s.replace('\r\n','\n').replace('\r','\n')

def criterion_section(raw,number):
    # Original report is the authority. Capture the first ACCEPTANCE CRITERIA in
    # a numbered command section, ending before the next command header.
    match=re.search(r'(?im)^COMMAND\s+0*'+str(number)+r'\s+[—-]',raw)
    if not match: raise ValueError(f'Original COMMAND 0{number} section not found')
    end=re.search(r'(?im)^COMMAND\s+0*'+str(number+1)+r'\s+[—-]',raw[match.end():])
    sec=raw[match.end(): match.end()+end.start() if end else len(raw)]
    m=re.search(r'(?im)^ACCEPTANCE CRITERIA\s*$',sec)
    if not m:raise ValueError(f'Original COMMAND 0{number} acceptance section not found')
    tail=sec[m.end():].splitlines()
    expected=10 if number==8 else 12
    actual=[]
    for line in tail:
        mm=re.match(r'^\s*(\d{1,2})\.\s+(.+?)\s*$',line)
        if mm:
            actual.append((int(mm.group(1)),mm.group(2)))
            if len(actual)>=expected:break
        elif actual and line.strip():
            break
    if len(actual)!=expected or [x[0] for x in actual]!=list(range(1,expected+1)):
        raise ValueError(f'Command 0{number}: expected {expected} sequential criteria, got {actual}')
    return actual

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',default='.',help='Xroga git repository root')
    p.add_argument('--report',default=None,help='Optional output JSON report path')
    args=p.parse_args()
    repo=Path(args.repo).resolve()
    workdir=Path(__file__).resolve().parent
    errors=[];warnings=[]
    work=json.loads((workdir/'PHASE-3-EXECUTION-WORKLIST.json').read_text(encoding='utf-8'))
    source=repo/work['source_contract_path']
    criteria=work['criteria']
    if len(criteria)!=22:errors.append(f'Worklist has {len(criteria)} rather than 22 original criteria')
    if len(set(x['id'] for x in criteria))!=22:errors.append('Repeated criterion IDs')
    if len(work['action_classes'])!=12 or len(set(work['action_classes']))!=12:errors.append('Expected 12 distinct original action classes')
    for name in ['CODEX_START_HERE.md','PHASE-3-ENGINEERING-PLAYBOOK.md','PHASE-3-CODE-HOTSPOTS.md',
                 'PHASE-3-TEST-MATRIX.csv','PHASE-3-ACCEPTANCE-GATES.md','PHASE-3-SETUP-AND-DEPENDENCIES.md']:
        if not (workdir/name).is_file():errors.append(f'Missing support file: {name}')
    if not source.is_file():
        errors.append(f'Missing original source contract in repo: {source}')
        raw='';contract_sha=None
    else:
        b=source.read_bytes();contract_sha=sha256(b);raw=norm(b.decode('utf-8-sig'))
        for command in [8,9]:
            try:
                for i,(num,txt) in enumerate(criterion_section(raw,command),1):
                    ident=f'XB01-C{command:03d}-AC{i:02d}'
                    found=[c for c in criteria if c['id']==ident]
                    if not found:errors.append(f'Missing original criterion: {ident}')
                    elif found[0]['original_text'].strip()!=txt.strip():
                        errors.append(f'{ident} original criterion differs from source: expected {txt!r} got {found[0]["original_text"]!r}')
            except Exception as e:errors.append(str(e))
    inventory=[]
    for obj in work['interfaces_to_check']:
        path=repo/obj['path'];present=path.is_file()
        inventory.append({'id':obj['id'],'path':obj['path'],'exists':present,'sha256':sha256(path.read_bytes()) if present else None})
        if not present:warnings.append('Reference path missing; inspect renamed source: '+obj['path'])
    frozen=repo/work['canonical_original_phase3_handoff_path']
    if frozen.exists():
        try:
            json.loads(frozen.read_text(encoding='utf-8'))
            frozen_note='Recovered original Phase 3 frozen worklist is present; compare it before proceeding.'
        except Exception as e:errors.append('Original frozen worklist invalid JSON: '+str(e));frozen_note='ERROR'
    else:
        frozen_note='Original untracked Phase 3 worklist NOT in checkout; this reconstructed pack does NOT replace its historical signed/hashes.'
        warnings.append(frozen_note)
    result={'type':'PHASE3_READ_ONLY_PREFLIGHT_NOT_ACCEPTANCE','repo':str(repo),'source_contract_sha256':contract_sha,
            'criteria_expected':22,'criteria_in_worklist':len(criteria),'action_classes':len(work['action_classes']),
            'phase2_reference':work['phase2_accepted_sha'],'frozen_worklist_note':frozen_note,
            'interface_inventory':inventory,'errors':errors,'warnings':warnings}
    print(json.dumps(result,indent=2))
    if args.report:Path(args.report).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    return 0 if not errors else 2

if __name__=='__main__':sys.exit(main())
