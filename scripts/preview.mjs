import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.xml':'application/xml','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=resolve(root,'.'+pathname);
  if(!file.startsWith(resolve(root)+sep)&&file!==resolve(root)){res.writeHead(403);res.end();return;}
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(resolve(root,'404.html')));}
}).listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173/'));
