const dispositions=new Set(['SCOPED_BOUNDARY','NARROW_EXCEPTION','NOT_PERSISTENCE','REVIEWED_GAP']);
const validPath=value=>typeof value==='string'&&/^(?:backend|frontend|scripts|supabase)\//.test(value)&&!value.split('/').includes('..')&&!value.includes('\\');

/** Audit evidence only. This never issues credentials, roles or a tenant context. */
export function applyCallerReviews(candidates,registry,readEvidence) {
  if(registry?.version!=='1.0'||!Array.isArray(registry.reviews))throw new Error('Invalid manual caller registry');
  const byId=new Map(candidates.map(row=>[row.id,row]));
  if(byId.size!==candidates.length)throw new Error('Duplicate persistence candidate identity');
  const reviews=new Map();
  for(const record of registry.reviews) {
    if(!validPath(record.path)||!/^[a-f0-9]{64}$/.test(record.sourceSha256??'')||!dispositions.has(record.disposition)
      ||!Array.isArray(record.callIds)||!record.callIds.length||typeof record.reason!=='string'||record.reason.length<40
      ||typeof record.authority!=='string'||record.authority.length<40||!Array.isArray(record.evidence)||!record.evidence.length)throw new Error('Incomplete semantic caller review');
    for(const proof of record.evidence) {
      if(!validPath(proof.path)||typeof proof.marker!=='string'||proof.marker.length<10)throw new Error('Invalid review evidence reference');
      const source=readEvidence(proof.path);
      if(typeof source!=='string'||!source.includes(proof.marker))throw new Error(`Unavailable review evidence: ${proof.path}`);
    }
    for(const id of record.callIds) {
      const candidate=byId.get(id);
      if(!candidate||candidate.path!==record.path||candidate.sourceSha256!==record.sourceSha256)throw new Error(`Stale or unknown caller review: ${record.path}`);
      if(reviews.has(id))throw new Error('Duplicate manual caller review');
      reviews.set(id,record);
    }
  }
  return candidates.map(candidate=>{
    const record=reviews.get(candidate.id);
    return record?{...candidate,review:record.disposition,semanticReview:{authority:record.authority,reason:record.reason,evidence:record.evidence}}:candidate;
  });
}
