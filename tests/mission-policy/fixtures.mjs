export const validMission={
  version:'1.0',missionId:'XB01-C006',baseSha:'a'.repeat(40),requirementIds:['XB01-C006'],state:'CODE_COMPLETE',risk:'low',scope:'Test-only structured policy fixture',
  changedFiles:['scripts/xroga/mission-check.mjs'],decisions:{keep:['Actual canonical runtime'],extend:['Evidence policy'],replace:[],deprecate:['Unsupported completion claims']},
  schemaImpact:{changed:false,migrations:[],rollout:'No DB change',rollback:'Revert tooling'},
  securityImpact:Object.fromEntries(['auth','tenant','approval','credentials','egress','cost','billing'].map(key=>[key,{changed:false,description:'No runtime change; fixture only'}])),
  tests:[{command:'node --test tests/mission-policy/mission-policy.test.mjs',scope:'Structured policy',negative:true,reference:'tests/mission-policy/mission-policy.test.mjs'}],
  architecture:{change:'none',reason:'No execution loop or provider runtime introduced',rfc:null},rollout:'CI-only tooling',rollback:'Revert tooling commit',knownGaps:['Actual authenticated E2E remains blocked'],placeholderClaimsRemaining:[],
  evidenceRefs:['docs/xroga/evidence/command-006/manifest.json'],claimsFullProductCompletion:false,claimsAllBatchCommandsComplete:false,
  release:{state:'BLOCKED',blockers:['Mandatory isolated/staged security configuration'],authenticatedE2e:'BLOCKED',stagedSecurity:'BLOCKED',liveUrl:null,deployedSha:null},
};
