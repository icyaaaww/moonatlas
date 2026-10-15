import test from 'node:test';
import assert from 'node:assert/strict';
import {core,emptyProject,replaceDocuments,parseProject,projectJSON,validateReviews} from '../web/project.mjs';
import {maintenanceReport} from '../web/maintenance.mjs';

test('review records roundtrip and older project files default to no reviews',()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# A'}]};
  const check=core('health',p)[0];
  p.reviews=[{id:check.id,state:'ignored',note:'故意保留',reopened:false}];
  assert.deepEqual(parseProject(projectJSON(p)),p);
  const {reviews,...legacy}=p;assert.deepEqual(parseProject(JSON.stringify(legacy)).reviews,[]);
  assert.throws(()=>validateReviews([{...p.reviews[0],note:''}]));
  assert.throws(()=>validateReviews([p.reviews[0],p.reviews[0]]));
  assert.throws(()=>validateReviews([{...p.reviews[0],state:'verified-safe'}]));
  assert.throws(()=>validateReviews([{...p.reviews[0],note:'x'.repeat(1001)}]));
});

test('source edits reopen affected reviews and repaired issues are removed',()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# A\n[x](missing.md)'},{path:'b.md',content:'# B'}]};
  p.reviews=core('health',p).map(c=>({id:c.id,state:'done',note:'checked',reopened:false}));
  const next=replaceDocuments(p,[{...p.documents[0],content:p.documents[0].content+'\nnew'},p.documents[1]]);
  const bId=core('health',p).find(c=>c.paths[0]==='b.md').id;
  assert.equal(next.reviews.find(r=>r.id===bId).state,'done');
  assert.ok(next.reviews.filter(r=>r.id!==bId).every(r=>r.state==='pending'&&r.reopened&&r.note==='checked'));
  const fixed=replaceDocuments(next,[...next.documents,{path:'missing.md',content:'# Found'}]);
  assert.ok(!fixed.reviews.some(r=>r.id.includes('"link"')));
  assert.equal(p.reviews[0].state,'done');
});

test('line edit ranges reconstruct exact text for repeated and random line sequences',()=>{
  let seed=42;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let trial=0;trial<200;trial++){
    const before=Array.from({length:rand()%30},()=>['repeat','中文','🙂','','a','b'][rand()%6]).join('\n');
    const after=Array.from({length:rand()%30},()=>['repeat','中文','🙂','','a','c'][rand()%6]).join('\n');
    const a=before===''?[]:before.split('\n'),b=after===''?[]:after.split('\n');
    const edits=core('lines',{before,after}).edits;
    const rebuilt=[];let old=0,newPosition=0;
    for(const e of edits){
      const x=e.before_start-1,y=e.after_start-1;
      assert.deepEqual(a.slice(old,x),b.slice(newPosition,y));
      rebuilt.push(...a.slice(old,x),...b.slice(y,y+e.after_count));old=x+e.before_count;newPosition=y+e.after_count;
    }
    assert.deepEqual(a.slice(old),b.slice(newPosition));rebuilt.push(...a.slice(old));assert.equal(rebuilt.join('\n'),after);
  }
  assert.throws(()=>core('lines',{before:'a'.repeat(200001),after:''}));
});

test('maintenance report includes review evidence but no source body or executable markup',()=>{
  const p={...emptyProject(),name:'<script>oops</script>',documents:[{path:'a.md',content:'# A\nSECRET BODY'}]};
  const checks=core('health',p);p.reviews=[{id:checks[0].id,state:'ignored',note:'<img src=x> [open](https://example.com)',reopened:false}];
  const report=maintenanceReport(p,checks,[]);
  assert.ok(report.includes('已忽略'));assert.ok(report.includes('a\\.md'));assert.ok(!report.includes('SECRET BODY'));assert.ok(!report.includes('<script>'));assert.ok(!report.includes('<img'));
});
