import {copyFileSync,existsSync,mkdirSync,readdirSync,readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export const publicPaths=Object.freeze(JSON.parse(readFileSync(new URL('./pages-manifest.json',import.meta.url),'utf8')));
const root=fileURLToPath(new URL('../',import.meta.url));
const publicDirectories=['assets','js','about','services','projects','how-we-work','careers','contact'];
// js/enquiry-contract.d.ts is a reviewed, non-published type declaration.
const nonPublished=['js/enquiry-contract.d.ts'];
const publicRootFiles=new Set(['404.html','CNAME','index.html','robots.txt','script.js','site.webmanifest','sitemap.xml','style.css']);
export function validatePublicManifest(paths) {
 if(!Array.isArray(paths) || new Set(paths).size!==paths.length || paths.some(p=>typeof p!=='string'||!/^[-a-zA-Z0-9_./]+$/.test(p)||p.split('/').some(s=>!s||s.startsWith('.'))||(!publicRootFiles.has(p)&&!publicDirectories.some(d=>p.startsWith(d+'/')))||/\.(?:sql|ps1|env|pem|key|pfx|p12|log)$/i.test(p)||nonPublished.includes(p))) throw new Error('Invalid public manifest.');
}
export function buildPages(destination,{sourceRoot=root,manifest=publicPaths}={}) {
 if(existsSync(destination)) throw new Error('Artifact destination must not exist; no overwrite or delete is performed.');
 validatePublicManifest(manifest);
 const actual=[];
 function walk(relative) {
  const full=resolve(sourceRoot,relative),stat=lstatSync(full);
  if(stat.isSymbolicLink()) throw new Error('Unexpected public artifact symlink.');
  if(stat.isDirectory()) for(const item of readdirSync(full)) walk(`${relative}/${item}`);
  else actual.push(relative);
 }
 for(const dir of publicDirectories) walk(dir);
 const approved=manifest.filter(p=>publicDirectories.some(d=>p.startsWith(d+'/'))).concat(nonPublished).sort();
 if(JSON.stringify(actual.sort())!==JSON.stringify(approved)) throw new Error('Unexpected public file or missing manifest entry.');
 for(const path of manifest) if(!lstatSync(resolve(sourceRoot,path)).isFile()||lstatSync(resolve(sourceRoot,path)).isSymbolicLink()) throw new Error('Unexpected public artifact entry.');
 if(!readFileSync(resolve(sourceRoot,'contact/index.html'),'utf8').includes('type="button" disabled>Review enquiry')) throw new Error('Contact must remain disabled initially.');
 mkdirSync(destination,{recursive:true});
 for(const path of manifest) {const target=resolve(destination,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(sourceRoot,path),target);}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 buildPages(resolve(root,'_site'));
 console.log('Built exact-manifest public artifact in _site; no deployment performed.');
}
