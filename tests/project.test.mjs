import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { core, build, emptyProject, replaceDocuments, parseProject, projectJSON, shareHTML, readDocuments } from '../web/project.mjs';
import { dispatch } from '../web/core.mjs';
import { sampleDocuments } from '../web/samples.mjs';
import { createServer } from '../host/server.mjs';

test('compiled MoonBit bridge rejects malformed transport and invalid document paths',()=>{
  assert.equal(JSON.parse(dispatch('{')).ok,false);
  assert.equal(JSON.parse(dispatch('{"action":"no"}')).ok,false);
  assert.throws(()=>build({...emptyProject(),documents:[{path:'../secret.md',content:'# Hi'}]}));
  assert.throws(()=>build({...emptyProject(),documents:[{path:'a.md',content:42}]}));
});
test('sample has truthful evidence, cross-document clues, missing links and exact duplicates',()=>{
  const a=build({...emptyProject(),documents:sampleDocuments});
  assert.equal(a.pages.length,8);
  assert.equal(a.duplicates.length,1);
  assert.equal(a.links.filter(l=>l.status==='missing').length,1);
  assert.equal(a.concepts.filter(c=>c.paths.length>1).length,3);
  for(const p of a.pages)for(const s of p.sections){
    const lines=sampleDocuments.find(d=>d.path===p.path).content.split('\n');
    assert.equal(s.evidence.quote,lines.slice(s.evidence.start_line-1,s.evidence.end_line).join('\n').slice(0,1200));
  }
});
test('project roundtrip keeps manual choices and comparison baseline',()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# A'}],baseline:[{path:'a.md',content:'# Old'}],preferences:[{path:'a.md',topic:'User',title:'Title'}],aliases:[{name:'A',target:'B'}]};
  assert.deepEqual(parseProject(projectJSON(p)),p);
  assert.equal(build(parseProject(projectJSON(p))).pages[0].topic,'User');
  assert.equal(core('compare',{before:p.baseline,after:p.documents})[0].kind,'updated');
});
test('validated replacement carries preferences only across unique rename',()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# A'}],preferences:[{path:'a.md',title:'My title',topic:'My topic'}]};
  const next=replaceDocuments(p,[{path:'b.md',content:'# A'}]);
  assert.equal(next.preferences[0].path,'b.md');
  assert.equal(build(next).pages[0].title,'My title');
  assert.throws(()=>replaceDocuments(p,[{path:'b.md',content:'x'},{path:'b.md',content:'y'}]));
  assert.equal(p.documents[0].path,'a.md');
});
test('project imports reject invalid metadata, aliases, baseline and oversized heading graph',()=>{
  assert.throws(()=>parseProject(JSON.stringify({...emptyProject(),version:2})));
  assert.throws(()=>parseProject(JSON.stringify({...emptyProject(),baseline:[{path:'/x.md',content:''}]})));
  assert.throws(()=>build({...emptyProject(),aliases:[{name:'a',target:'b'},{name:'b',target:'a'}]}));
  assert.throws(()=>build({...emptyProject(),documents:[{path:'many.md',content:'# a\n'.repeat(3001)}]}));
});
test('standalone sharing escapes hostile content and restores its exact original text',async()=>{
  const p={...emptyProject(),documents:[{path:'a.md',content:'# </script><script>globalThis.pwned=true</script> & <img onerror=alert(1)>'}]};
  const html=shareHTML(await readFile(new URL('../dist/MoonAtlas.html',import.meta.url),'utf8'),p);
  const embedded=html.match(/<script id="moonatlas-seed" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!embedded.includes('<'));
  assert.deepEqual(parseProject(embedded),p);
  assert.ok(!html.includes('<script>globalThis.pwned'));
});
test('file import enforces UTF8 and keeps relative folder links',async()=>{
  const file=new File(['# OK'],'note.md');Object.defineProperty(file,'webkitRelativePath',{value:'vault/docs/note.md'});
  const {documents}=await readDocuments([file]);assert.equal(documents[0].path,'docs/note.md');
  await assert.rejects(()=>readDocuments([new File([new Uint8Array([0xff])],'bad.md')]));
  await assert.rejects(()=>readDocuments([new File(['x'],'a.md'),new File(['y'],'a.md')]));
});
test('host serves only app assets and has no write endpoints',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const root=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(root)).status,200);
    assert.equal((await fetch(root+'/package.json')).status,404);
    assert.equal((await fetch(root+'/',{method:'POST',body:'data'})).status,405);
    assert.match((await fetch(root+'/core.mjs')).headers.get('content-type'),/javascript/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
