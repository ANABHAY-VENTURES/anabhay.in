import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const walk=dir=>readdirSync(dir,{withFileTypes:true}).filter(e=>!e.name.startsWith('.')).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);
const files=walk(root),htmlFiles=files.filter(p=>p.endsWith('.html'));
const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
let mainNav,footerNav;
for(const file of htmlFiles){
 const html=readFileSync(file,'utf8');
 assert.match(html,/<!doctype html>/i,file);assert.match(html,/<html lang="en">/,file);
 assert.equal((html.match(/<h1\b/g)||[]).length,1,`${file}: one h1`);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,`${file}: duplicate ids`);
 const stack=[];
 const stripped=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'<script></script>').replace(/<!--[\s\S]*?-->/g,'');
 for(const m of stripped.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){
  const tag=m[1].toLowerCase();if(voids.has(tag))continue;
  if(m[0].startsWith('</'))assert.equal(stack.pop(),tag,`${file}: tag nesting ${m[0]}`);else stack.push(tag);
 }assert.equal(stack.length,0,`${file}: unclosed tags`);
 const navs=[...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].map(m=>m[1].replace(/ aria-current="page"/g,''));
 assert.equal(navs.length,2);mainNav??=navs[0];footerNav??=navs[1];assert.equal(navs[0],mainNav);assert.equal(navs[1],footerNav);
 for(const tag of html.matchAll(/<(?:a|link|script|img|input|select|textarea|button|label)\b[^>]*>/g)){
  const a=attrs(tag[0]);
  for(const attr of ['href','src'])if(a[attr]&&!/^https?:/.test(a[attr])){
   const [path,hash]=a[attr].split('#');assert.ok(!path||path.startsWith('/'),`${file}: root relative ${a[attr]}`);
   let target=path?resolve(root,'.'+path):file;if(path.endsWith('/'))target=resolve(target,'index.html');
   assert.ok(existsSync(target),`${file}: missing ${a[attr]}`);
   if(hash){const targetHtml=readFileSync(target,'utf8');assert.ok(targetHtml.includes(`id="${hash}"`),`${file}: missing anchor ${hash}`);}
  }
  for(const attr of ['aria-describedby','aria-controls'])if(a[attr])for(const id of a[attr].split(' '))assert.ok(ids.includes(id),`${file}: missing ARIA target ${id}`);
  if(a.for)assert.ok(ids.includes(a.for));
 }
 for(const meta of ['description','twitter:card','twitter:title','twitter:description','twitter:image'])assert.ok(html.includes(`name="${meta}"`));
 for(const meta of ['og:title','og:description','og:url','og:image'])assert.ok(html.includes(`property="${meta}"`));
 assert.match(html,/<link rel="canonical" href="https:\/\/anabhay.in/);
 const json=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);JSON.parse(json[1]);
 if(!file.endsWith(resolve(root,'index.html')))assert.ok(!html.includes('src="/script.js"'));
 assert.ok(!/IN THE MAKING|countdown|2027-01-01|COMING ALIVE/.test(html));
}
for(const file of files.filter(p=>['.js','.mjs'].includes(extname(p))))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const manifest=JSON.parse(readFileSync(resolve(root,'site.webmanifest'),'utf8'));for(const icon of manifest.icons)assert.ok(existsSync(resolve(root,'.'+icon.src)));
const sitemap=readFileSync(resolve(root,'sitemap.xml'),'utf8');const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);assert.equal(urls.length,9);assert.equal(new Set(urls).size,9);assert.ok(!sitemap.includes('404'));
for(const url of urls){const pathname=new URL(url).pathname;assert.ok(existsSync(resolve(root,'.'+pathname,'index.html')));}
assert.match(readFileSync(resolve(root,'robots.txt'),'utf8'),/Sitemap: https:\/\/anabhay.in\/sitemap.xml/);
console.log(`PASS: ${htmlFiles.length} pages; balanced markup; consistent navigation; links, assets, anchors, ARIA references, metadata, manifest, sitemap; JS syntax.`);
