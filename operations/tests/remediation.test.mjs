import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,cpSync,readFileSync,readdirSync,existsSync,mkdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildPages,publicPaths} from '../../scripts/build-pages.mjs';
import {enquiryCapabilities,requestFingerprint,recordNote,confirmProviderAcceptance} from '../server/capabilities.mjs';
import {handleEnquiry} from '../server/http.mjs';
import {submitEnquiry} from '../../js/enquiry-api.js';
import {validateRequest,reviewSubmission} from '../server/enquiry.mjs';
const payload={schemaVersion:1,fullName:'Synthetic QA',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic test enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
const key='00000000-0000-4000-8000-000000000001';
const origin='https://website.example.invalid';
const dependencies={abuseCheck:async()=>true,persist:async()=>({persisted:true,enquiryId:key,notification:'queued'})};
const options={enabled:true,allowedOrigins:[origin],dependencies,fingerprint:'a'.repeat(64)};
const req=(method='POST',overrides={})=>new Request('https://api.example.invalid/enquiries',{method,headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,...overrides},...(method==='POST'?{body:JSON.stringify(payload)}:{})});
test('HTTP remains disabled by default; rejects unapproved origins before persistence',async()=>{
 let calls=0;const deps={...dependencies,persist:async()=>{calls++;}};
 assert.equal((await handleEnquiry(req(),{allowedOrigins:[origin],dependencies:deps})).status,503);
 assert.equal((await handleEnquiry(req('POST',{Origin:'https://other.example.invalid'}),{...options,dependencies:deps})).status,403);assert.equal(calls,0);
});
test('exact CORS preflight and credential-free public contract',async()=>{
 const result=await handleEnquiry(req('OPTIONS',{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,idempotency-key'}),options);
 assert.equal(result.status,204);assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(result.headers.get('Access-Control-Allow-Credentials'),null);
 assert.equal((await handleEnquiry(req('OPTIONS',{'Access-Control-Request-Method':'DELETE'}),options)).status,403);
 assert.equal((await handleEnquiry(req('OPTIONS',{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'}),options)).status,403);
});
test('HTTP preserves 201/409/422/429/503 and rejects oversized streaming bodies',async()=>{
 assert.equal((await handleEnquiry(req(),options)).status,201);
 assert.equal((await handleEnquiry(req(),{...options,dependencies:{...dependencies,persist:async()=>({conflict:true})}})).status,409);
 assert.equal((await handleEnquiry(req(),{...options,dependencies:{...dependencies,abuseCheck:async()=>false}})).status,429);
 const failed=await handleEnquiry(req(),{...options,dependencies:{...dependencies,abuseCheck:async()=>{throw new Error('internal secret');}}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('internal'));
 assert.equal((await handleEnquiry(new Request('https://api.example.invalid/enquiries',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'x'.repeat(16385)}),options)).status,422);
 assert.equal((await handleEnquiry(req(),{...options,fingerprint:null})).status,503);
});
test('capabilities use fixed SQL and bound parameters; limiter results fail closed',async()=>{
 const calls=[];const deps=enquiryCapabilities(async(sql,args)=>{calls.push([sql,args]);return sql.includes('consume_enquiry_limit')?{allowed:true}:{receipt:{persisted:true}};});
 assert.equal(await deps.abuseCheck('a'.repeat(64)),true);
 await deps.persist({key,hash:'b'.repeat(64),payload});assert.equal(calls.length,2);assert.ok(calls.every(([sql])=>!sql.includes(key)));
 await assert.rejects(enquiryCapabilities(async()=>({})).abuseCheck('a'.repeat(64)),e=>e.status===503);
});
test('rate identity uses trusted runtime metadata, keyed hashing and no raw identity storage',()=>{
 const secret='synthetic-secret-not-a-real-key-32';const hash=requestFingerprint('synthetic-network',secret);assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(hash,requestFingerprint('synthetic-network',secret));assert.notEqual(hash,requestFingerprint('other-network',secret));assert.throws(()=>requestFingerprint('',secret),e=>e.status===503);
});
test('staff note rejects supplied actors/roles and unauthenticated users; preserves user client',async()=>{
 let calls=0;const client={auth:{getUser:async()=>({data:{user:{id:key}}})},schema:s=>{assert.equal(s,'operations');return {rpc:async(name,args)=>{calls++;assert.equal(name,'record_lead_note');assert.deepEqual(Object.keys(args).sort(),['p_body','p_lead']);return {data:key};}};}};
 assert.deepEqual(await recordNote({leadId:key,body:'synthetic note'},{verifiedUserClient:client}),{recorded:true});
 await assert.rejects(recordNote({leadId:key,body:'synthetic note',actorId:key},{verifiedUserClient:client}),e=>e.status===422);
 await assert.rejects(recordNote({leadId:key,body:'synthetic note'},{verifiedUserClient:{auth:{getUser:async()=>({error:true})}}}),e=>e.status===403);assert.equal(calls,1);
});
test('provider acceptance cannot advance without verified receipt; never claims delivery',async()=>{
 let calls=0;const job={id:key,leaseToken:'synthetic-in-memory-token'};
 await assert.rejects(confirmProviderAcceptance(job,{}, {verifyProviderReceipt:async()=>({accepted:false}),acceptCommitted:async()=>{calls++;}}));assert.equal(calls,0);
 assert.deepEqual(await confirmProviderAcceptance(job,{}, {verifyProviderReceipt:async()=>({accepted:true,messageId:'synthetic-provider-id'}),acceptCommitted:async()=>{calls++;}}),{accepted:true});assert.equal(calls,1);
});
test('exact manifest rejects unexpected permitted-extension assets before output exists',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anabhay-manifest-'));
 try {const source=join(dir,'source');buildPages(source);cpSync(new URL('../../js/enquiry-contract.d.ts',import.meta.url),join(source,'js/enquiry-contract.d.ts'));writeFileSync(join(source,'assets/unexpected.js'),'synthetic fixture');assert.throws(()=>buildPages(join(dir,'output'),{sourceRoot:source}),/Unexpected public file/);}
 finally {rmSync(dir,{recursive:true,force:true});}
});
test('artifact file inventory exactly equals manifest',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anabhay-manifest-'));
 try {const dest=join(dir,'site');buildPages(dest);const walk=(path,prefix='')=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(path,e.name),prefix+e.name+'/'):[prefix+e.name]);assert.deepEqual(walk(dest).sort(),[...publicPaths].sort());}
 finally {rmSync(dir,{recursive:true,force:true});}
});
test('cross-origin requires exact approved endpoint and still omits credentials',async()=>{
 globalThis.location={origin};const endpoint='https://api.example.invalid/enquiries';let calls=0;
 const fetchImpl=async(url,init)=>{calls++;assert.equal(url,endpoint);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');return {ok:true,json:async()=>({persisted:true,enquiryId:key,notification:'queued'})};};
 await assert.rejects(submitEnquiry(payload,{endpoint,requestId:key,fetchImpl}));assert.equal(calls,0);
 await submitEnquiry(payload,{endpoint,allowedEndpoint:endpoint,requestId:key,fetchImpl});assert.equal(calls,1);
 await assert.rejects(submitEnquiry(payload,{endpoint:endpoint+'/other',allowedEndpoint:endpoint,requestId:key,fetchImpl}));assert.equal(calls,1);
 delete globalThis.location;
});
test('migration capabilities are guarded, ledgered and have no broad administration APIs',()=>{
 const sql=readFileSync(new URL('../migrations/004_capabilities.sql',import.meta.url),'utf8');
 for(const name of ['consume_enquiry_limit','record_lead_note','claim_notification','accept_notification','retry_notification'])assert.ok(sql.includes('operations.'+name));
 assert.match(sql,/slot between 0 and 4096/);assert.match(sql,/for update skip locked/);assert.match(sql,/lease_token=p_token/);assert.match(sql,/actor_id=\(select auth.uid\(\)\)/);assert.match(sql,/migration_versions/);assert.doesNotMatch(sql,/grant.*bypassrls|if exists|cascade|create or replace/i);
});

test('phone normalization and validation agree with database ASCII constraints',()=>{
 for(const phone of ['', '   ', null]) assert.equal(validateRequest(JSON.stringify({...payload,phone}),key).payload.phone,null);
 assert.equal(validateRequest(JSON.stringify({...payload,phone:' +91 (98329) 77184 '}),key).payload.phone,'+91 (98329) 77184');
 for(const phone of ['123\t4567890','123\n4567890','123\u00a04567890','１２３４５６７８９０','123456','1'.repeat(16)]) assert.throws(()=>validateRequest(JSON.stringify({...payload,phone}),key),e=>e.status===422);
 assert.throws(()=>validateRequest(JSON.stringify({...payload,fullName:'QA\0Example'}),key),e=>e.status===422);
 assert.throws(()=>validateRequest(JSON.stringify({...payload,phone:' ',preferredContactMethod:'phone'}),key),e=>e.status===422);
});

test('malformed, oversized, invalid UTF-8 and wrong-type POSTs consume one attempt before rejection',async()=>{
 let attempts=0,persisted=0;
 const opts={...options,dependencies:{abuseCheck:async()=>{attempts++;return true;},persist:async()=>{persisted++;}}};
 for(const [body,extra] of [['{',{}],['x'.repeat(16385),{}],[new Uint8Array([0xc3,0x28]),{}],[JSON.stringify(payload),{'Content-Type':'text/plain'}],[JSON.stringify(payload),{'Content-Length':'16385'}],[JSON.stringify({...payload,role:'owner'}),{}]]) {
  const before=attempts;
  const request=new Request('https://api.example.invalid/enquiries',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,...extra},body});
  const response=await handleEnquiry(request,opts);
  assert.equal(response.status,422);assert.equal(attempts,before+1);assert.equal(persisted,0);
 }
});

test('rate denial/outage stops body reading; unknown limiter results fail closed',async()=>{
 for(const outcome of [false,undefined,'true']) {
  let reads=0;
  const stream=new ReadableStream({pull(){reads++;}},{highWaterMark:0});
  const request=new Request('https://api.example.invalid/enquiries',{method:'POST',duplex:'half',headers:{Origin:origin,'Content-Type':'application/json'},body:stream});
  const response=await handleEnquiry(request,{...options,dependencies:{abuseCheck:async()=>outcome,persist:async()=>assert.fail('must not persist')}});
  assert.equal(response.status,outcome===false?429:503);assert.equal(reads,0);
 }
});

test('body deadline cancels stalled stream with safe 408 after one accounted attempt',async()=>{
 let cancelled=false,attempts=0;
 const stream=new ReadableStream({pull(){},cancel(){cancelled=true;}},{highWaterMark:0});
 const request=new Request('https://api.example.invalid/enquiries',{method:'POST',duplex:'half',headers:{Origin:origin,'Content-Type':'application/json'},body:stream});
 const response=await handleEnquiry(request,{...options,bodyDeadlineMs:10,dependencies:{abuseCheck:async()=>{attempts++;return true;},persist:async()=>assert.fail('must not persist')}});
 assert.equal(response.status,408);assert.equal(attempts,1);assert.equal(cancelled,true);
});

test('database boundary deadline signals abort and never proceeds after uncertain rate result',async()=>{
 let calls=0,signal;
 const deps=enquiryCapabilities(async(sql,args,options)=>{calls++;signal=options.signal;return new Promise(()=>{});},{queryDeadlineMs:10});
 await assert.rejects(reviewSubmission(JSON.stringify(payload),key,{...deps,fingerprint:'a'.repeat(64)}),e=>e.status===503);
 assert.equal(calls,1);assert.equal(signal.aborted,true);
});

test('mock lost commit acknowledgement keeps the same key and returns replay on deliberate retry',async()=>{
 // Boundary simulation only: does NOT establish real driver/DB commit behavior.
 const records=new Map();const keys=[];
 const deps=enquiryCapabilities(async(sql,args)=>{
  if(sql.includes('consume_enquiry_limit'))return {allowed:true};
  keys.push(args[0]);
  if(!records.has(args[0])){records.set(args[0],{persisted:true,enquiryId:key,notification:'queued'});throw new Error('synthetic lost acknowledgement');}
  return {receipt:{...records.get(args[0]),replayed:true}};
 });
 await assert.rejects(reviewSubmission(JSON.stringify(payload),key,{...deps,fingerprint:'a'.repeat(64)}),e=>e.status===503&&!e.message.includes('acknowledgement'));
 assert.equal(keys.length,1); // no automatic retry
 const result=await reviewSubmission(JSON.stringify(payload),key,{...deps,fingerprint:'a'.repeat(64)});
 assert.equal(result.status,200);assert.equal(result.body.notification,'queued');assert.deepEqual(keys,[key,key]);assert.equal(records.size,1);
});

test('mock ingestion timeout is unconfirmed even when ignored cancellation later commits',async()=>{
 // Intentionally noncompliant fake driver proves timeout is NOT rollback proof.
 let finish,signal,calls=0;const records=new Map();
 const deps=enquiryCapabilities(async(sql,args,options)=>{
  if(sql.includes('consume_enquiry_limit'))return {allowed:true};
  calls++;
  if(records.has(args[0]))return {receipt:{...records.get(args[0]),replayed:true}};
  signal=options.signal;
  return new Promise(resolve=>{finish=()=>{const receipt={persisted:true,enquiryId:key,notification:'queued'};records.set(args[0],receipt);resolve({receipt});};});
 },{queryDeadlineMs:10});
 await assert.rejects(reviewSubmission(JSON.stringify(payload),key,{...deps,fingerprint:'a'.repeat(64)}),e=>e.status===503);
 assert.equal(calls,1);assert.equal(signal.aborted,true);assert.equal(records.size,0);
 finish();await Promise.resolve(); // late mocked commit despite cancellation signal
 assert.equal(records.size,1);
 const replay=await reviewSubmission(JSON.stringify(payload),key,{...deps,fingerprint:'a'.repeat(64)});
 assert.equal(replay.status,200);assert.equal(calls,2);assert.equal(records.size,1);
});

test('mock provider acceptance plus database failure never reports success or changes job identity',async()=>{
 const job={id:key,leaseToken:'synthetic-memory-lease'};const seen=[];let confirmed=0;
 const verifyProviderReceipt=async()=>{seen.push(job.id);return {accepted:true,messageId:'synthetic-provider-id'};};
 await assert.rejects(confirmProviderAcceptance(job,{}, {verifyProviderReceipt,acceptCommitted:async()=>{throw new Error('synthetic lost DB response');}}),e=>e.status===503&&!e.message.includes('DB response'));
 assert.equal(seen.length,1);
 assert.deepEqual(await confirmProviderAcceptance(job,{}, {verifyProviderReceipt,acceptCommitted:async()=>{confirmed++;}}),{accepted:true});
 assert.deepEqual(seen,[key,key]);assert.equal(confirmed,1);
 // Real provider idempotency, renewed leases and external delivery remain blocked.
});

test('manifest cannot add backend, migration, secret or unapproved root paths',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anabhay-roots-'));
 try {
  for(const path of ['operations/server/enquiry.mjs','operations/migrations/001_staff_crm.sql','scripts/test.js','.env','assets/.env','assets/key.pem','assets/private.key','js/backend.sql','unknown.html','assets/../operations/server/enquiry.mjs','assets//file.png']) {
   const dest=join(dir,'artifact');assert.throws(()=>buildPages(dest,{manifest:[...publicPaths,path]}),/Invalid public manifest/);assert.equal(existsSync(dest),false);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('public-directory symlink is rejected before artifact creation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'anabhay-symlink-'));
 try {
  const source=join(dir,'source');buildPages(source);cpSync(new URL('../../js/enquiry-contract.d.ts',import.meta.url),join(source,'js/enquiry-contract.d.ts'));
  const privateDir=join(dir,'private');mkdirSync(privateDir);writeFileSync(join(privateDir,'fixture.txt'),'synthetic private fixture');
  symlinkSync(privateDir,join(source,'assets','linked-private'),'junction');
  assert.throws(()=>buildPages(join(dir,'output'),{sourceRoot:source}),/symlink/);assert.equal(existsSync(join(dir,'output')),false);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
