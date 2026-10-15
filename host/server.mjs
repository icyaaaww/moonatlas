import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT || 4173);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const routes=new Map([['/','web/index.html'],['/index.html','web/index.html'],['/style.css','web/style.css'],['/app.mjs','web/app.mjs'],['/core.mjs','web/core.mjs'],['/project.mjs','web/project.mjs'],['/samples.mjs','web/samples.mjs'],['/MoonAtlas.html','dist/MoonAtlas.html']]);
for(const name of ['history','local-draft','map-view','maintenance','maintenance-sample'])routes.set(`/${name}.mjs`,`web/${name}.mjs`);
export function createServer() {
  return http.createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const file=routes.get(new URL(req.url,'http://localhost').pathname);
    if(!file){res.writeHead(404);res.end('Not found');return;}
    try{const data=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);}
    catch{res.writeHead(404);res.end('Build the application first.');}
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createServer().listen(port,'127.0.0.1',()=>console.log(`MoonAtlas: http://127.0.0.1:${port}`));
