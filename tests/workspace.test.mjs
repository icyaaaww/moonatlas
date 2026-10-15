import test from 'node:test';
import assert from 'node:assert/strict';
import {backupJSON,readBackup,canonicalProject} from '../web/backup.mjs';
import {emptyProject,planImport,readDocuments,core} from '../web/project.mjs';

test('backup restores supported data and rejects corruption in each meaningful field',async()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# A\n🙂'}],baseline:[{path:'a.md',content:'# Old'}],preferences:[{path:'a.md',topic:'T',title:'Name'}],aliases:[{name:'A',target:'Alias'}]};
  p.reviews=core('health',{...p,preferences:[]}).map(c=>({id:c.id,state:'ignored',note:'<literal>',reopened:false}));
  const text=await backupJSON(p),result=await readBackup(text);assert.equal(result.verified,true);assert.deepEqual(result.project,p);
  for(const mutate of [p=>p.name='bad',p=>p.documents[0].content+='changed',p=>p.baseline[0].content+='changed',p=>p.preferences[0].topic='bad',p=>p.aliases=[],p=>p.reviews=[]]){
    const raw=JSON.parse(text);mutate(raw);await assert.rejects(()=>readBackup(JSON.stringify(raw)),/不一致/);
  }
  const raw=JSON.parse(text);raw.backup.digest='bad';await assert.rejects(()=>readBackup(JSON.stringify(raw)),/无效/);
  const legacy=await readBackup(JSON.stringify(p));assert.equal(legacy.verified,false);assert.equal(canonicalProject(legacy.project),canonicalProject(p));
});

test('import plans preview merge versus replacement without mutating current project',()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'old'},{path:'b.md',content:'keep'}],baseline:[{path:'b.md',content:'keep'}]};
  const original=structuredClone(p),incoming=[{path:'a.md',content:'new'},{path:'c.md',content:'added'}];
  const merge=planImport(p,incoming),replace=planImport(p,incoming,true);
  assert.equal(merge.next.documents.length,3);assert.ok(!merge.changes.some(c=>c.kind==='removed'));
  assert.equal(replace.changes.find(c=>c.kind==='removed').path,'b.md');assert.deepEqual(p,original);
  assert.equal(planImport(p,p.documents).unchanged.length,2);
});

test('cancelled reading produces no partial project and progress names skipped files',async()=>{
  const controller=new AbortController(),files=[new File(['# A'],'a.md'),new File(['# B'],'b.md'),new File(['PDF'],'notes.pdf')];
  let count=0;
  await assert.rejects(()=>readDocuments(files,{signal:controller.signal,onProgress:()=>{count++;controller.abort();}}),{name:'AbortError'});assert.equal(count,1);
  const result=await readDocuments(files);assert.equal(result.documents.length,2);assert.deepEqual(result.skippedFiles,['notes.pdf']);
});

test('search transport limits output but returns long-line match snippets',()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# Title\n'+'x'.repeat(1000)+' needle '+'y'.repeat(1000)}]};
  const result=core('search',{...p,query:'NEEDLE'});assert.equal(result.hits[0].line,2);assert.ok(result.hits[0].snippet.includes('needle'));assert.ok(result.hits[0].snippet.length<250);
});
