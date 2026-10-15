import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectHistory} from '../web/history.mjs';
import {DraftWriter,DraftConflict,LocalDraft} from '../web/local-draft.mjs';
import {core} from '../web/project.mjs';

test('undo snapshots are independent, redo branches are cleared and count is bounded',()=>{
  const h=new ProjectHistory({limit:2});const original={title:'A',nested:{value:1}};
  h.push(original);original.nested.value=2;
  assert.equal(h.undo({title:'B'}).nested.value,1);assert.deepEqual(h.redo({title:'A'}),{title:'B'});
  h.push({title:'B'});h.push({title:'C'});assert.equal(h.past.length,2);
  assert.equal(h.undo({title:'D'}).title,'C');h.push({title:'E'});assert.equal(h.future.length,0);
  assert.equal(h.undo({title:'F'}).title,'E');
});
test('undo history respects memory budget and reset cannot revive old projects',()=>{
  const h=new ProjectHistory({maxChars:30});h.push({x:'a'});h.push({x:'b'});h.push({x:'c'});h.push({x:'d'});
  assert.ok(h.past.reduce((n,s)=>n+s.length,0)<=30);assert.equal(h.push({x:'x'.repeat(50)}),false);
  assert.equal(h.past.length,0);h.push({x:'a'});h.undo({x:'b'});h.clear();assert.equal(h.redo({}),null);
});
test('draft writer serializes revisions, preserves snapshots, and reports last completed save',async()=>{
  let revision=null;const saved=[];const statuses=[];
  const store={async save(project,expected){assert.equal(expected,revision);revision=String(saved.length+1);saved.push(project);return {project,revision};}};
  const writer=new DraftWriter(store,(s)=>statuses.push(s));writer.enable();
  const p={name:'A'};const first=writer.enqueue(p);p.name='B';const second=writer.enqueue(p);
  await Promise.all([first,second]);assert.deepEqual(saved,[{name:'A'},{name:'B'}]);assert.equal(writer.revision,'2');assert.equal(statuses.at(-1),'saved');
});
test('stopping and clearing cannot be undone by an in-flight save',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);let began;const started=new Promise(resolve=>began=resolve);let removed=false;
  const store={async save(){began();await gate;return {revision:'new'};},async remove(expected){assert.equal(expected,'new');removed=true;}};
  const writer=new DraftWriter(store,()=>{});writer.enable();const saving=writer.enqueue({name:'A'});await started;
  const clearing=writer.clear();release();await Promise.all([saving,clearing]);assert.equal(removed,true);assert.equal(writer.enabled,false);assert.equal(writer.revision,null);
});
test('storage failures pause autosave, leave no false success and do not replay queued writes',async()=>{
  let calls=0;const states=[];const writer=new DraftWriter({async save(){calls++;throw new DraftConflict();}},s=>states.push(s));writer.enable('old');
  const first=writer.enqueue({name:'A'});const second=writer.enqueue({name:'B'});
  await assert.rejects(first,/另一个窗口/);await second;assert.equal(calls,1);assert.equal(writer.enabled,false);assert.equal(states.includes('saved'),false);
  await assert.rejects(()=>new LocalDraft(null,'x').read(),/不支持/);
});
test('section JSON transport includes complete before and after evidence',()=>{
  const result=core('sections',{before:{path:'x.md',content:'# A\n## Chapter\nold'},after:{path:'x.md',content:'# A\n## Chapter\nnew'}});
  assert.equal(result.changes.length,1);assert.equal(result.changes[0].before.start_line,2);
  assert.equal(result.changes[0].after_text,'## Chapter\nnew');assert.equal(result.changes[0].kind,'updated');
});
