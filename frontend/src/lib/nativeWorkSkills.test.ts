import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {NATIVE_WORK_SKILLS,nativeWorkSkillById,buildNativeWorkSkillPrompt,nativeSkillWorkspaceHref} from './nativeWorkSkills';

test('40 unique, complete work recipes',()=>{
 assert.equal(NATIVE_WORK_SKILLS.length,40);
 assert.equal(new Set(NATIVE_WORK_SKILLS.map(s=>s.id)).size,40);
 for(const s of NATIVE_WORK_SKILLS){assert.ok(s.title&&s.description&&s.inputs&&s.deliverable&&s.example);}
});
test('native skill instructions require verifiable results and never pretend tools are installed',()=>{
 const s=nativeWorkSkillById('complete-website-health-audit');
 assert.ok(s);
 const prompt=buildNativeWorkSkillPrompt(s!);
 assert.match(prompt,/available, approved native tools/);
 assert.match(prompt,/Never fabricate output/);
 assert.match(prompt,/My task details/);
 assert.equal(nativeSkillWorkspaceHref(s!.id),'/workspace?nativeSkill=complete-website-health-audit');
});
test('library and plus-menu use the same catalog and the workspace handoff',()=>{
 const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
 assert.match(read('../components/library/LibraryWorkspace.tsx'),/NativeSkillsDirectory/);
 assert.match(read('../components/terminal/ChatBarActionsMenu.tsx'),/NativeSkillsPicker/);
 assert.match(read('../components/terminal/TerminalChatBar.tsx'),/nativeSkill/);
});
