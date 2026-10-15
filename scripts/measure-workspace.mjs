import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {build,core,emptyProject,planImport} from '../web/project.mjs';
import {backupJSON,readBackup} from '../web/backup.mjs';
const result={date:new Date().toISOString(),node:process.version,os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,scope:'Synthetic Node measurements, median of 3; not browser end-to-end latency or a performance guarantee',cases:[]};
for(const count of [20,100,200]){
  const baseline=Array.from({length:count},(_,i)=>({path:`team/note-${String(i).padStart(3,'0')}.md`,content:Array.from({length:15},(_,j)=>`## Heading ${j}\nDocument ${i} SEARCHABLE ${'文字'.repeat(300)}\n[reference](note-000.md)`).join('\n')}));
  const documents=baseline.map((d,i)=>i===0?{...d,content:d.content.replace('Document','Updated document')}:d);
  const project={...emptyProject(),documents,baseline};const timings={};
  async function measure(name,fn){const values=[];let value;for(let i=0;i<3;i++){const start=performance.now();value=await fn();values.push(performance.now()-start);}values.sort((a,b)=>a-b);timings[name]=Math.round(values[1]);return value;}
  const atlas=await measure('buildMs',()=>build(project));
  await measure('previewMs',()=>planImport({...project,documents:baseline},documents));
  await measure('searchMs',()=>core('search',{...project,query:'searchable'}));
  await measure('impactMs',()=>core('impacts',{before:baseline,after:documents}));
  const backup=await measure('backupMs',()=>backupJSON(project));
  await measure('restoreMs',()=>readBackup(backup));
  result.cases.push({documents:count,headings:atlas.pages.reduce((n,p)=>n+p.sections.length,0),utf16:documents.reduce((n,d)=>n+d.content.length,0),...timings});
}
console.log(JSON.stringify(result,null,2));
