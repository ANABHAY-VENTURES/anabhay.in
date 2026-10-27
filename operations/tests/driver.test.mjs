import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPostgresDriver} from '../server/postgres.mjs';
import {validateRequest} from '../server/enquiry.mjs';
const config={host:'local.example.invalid',expectedHost:'local.example.invalid',database:'synthetic',user:'synthetic_login',password:'synthetic-not-a-real-password',ssl:{rejectUnauthorized:true},max:1};
const payload={schemaVersion:1,fullName:'Synthetic QA',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic test enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
const request=validateRequest(JSON.stringify(payload),'00000000-0000-4000-8000-000000000001');
function fixture(behavior=async()=>({rows:[{receipt:{persisted:true,enquiryId:request.key,notification:'queued'}}]}),options={}) {
 const calls=[],released=[],pools=[];
 class Pool extends EventEmitter {
  constructor(config){super();this.config=config;pools.push(this);}
  async connect(){if(options.connect)return options.connect();return {query:async(sql,args)=>{
   calls.push([sql,args]);
   if(sql.startsWith('SELECT current_user'))return {rows:[{privileged:false,extra:false,capability:true}]};
   if(sql==='COMMIT'){if(options.commit)return options.commit();return {command:'COMMIT'};}
   if(sql.includes('operations.'))return behavior(sql,args);
   return {rows:[]};
  },release:destroy=>released.push(destroy===true)};}
  async end(){this.ended=true;}
 }
 const driver=createPostgresDriver({ingestion:config,notification:{...config,user:'synthetic_worker'},operationMs:30,acquisitionMs:10,...options.settings},{Pool});
 return {driver,calls,released,pools};
}
test('fixed parameterized ingestion returns only after acknowledged commit and releases healthy client',async()=>{
 const f=fixture();const receipt=await f.driver.ingestEnquiry(request);assert.equal(receipt.persisted,true);
 assert.equal(f.calls.at(-1)[0],'COMMIT');assert.deepEqual(f.released,[false]);
 assert.deepEqual(f.calls.find(([s])=>s.includes('ingest_enquiry'))[1],[request.key,request.hash,JSON.stringify(request.payload)]);
 assert.equal(f.pools.length,2);assert.notEqual(f.pools[0],f.pools[1]);await f.driver.shutdown();
});
test('precommit error disposes transaction without sending commit',async()=>{
 const f=fixture(async()=>{throw new Error('synthetic private backend details');});
 await assert.rejects(f.driver.ingestEnquiry(request),e=>e.outcome==='not-committed'&&!e.message.includes('private'));
 assert.ok(!f.calls.some(([s])=>s==='COMMIT'));assert.deepEqual(f.released,[true]);await f.driver.shutdown();
 assert.ok(f.calls.some(([s])=>s==='ROLLBACK'));
});
test('lost COMMIT acknowledgement is unknown; explicit same-key reconciliation replays once',async()=>{
 const records=new Map();let commits=0;
 const f=fixture(async(sql,args)=>{const old=records.has(args[0]);records.set(args[0],true);return {rows:[{receipt:{persisted:true,replayed:old}}]};},{commit:async()=>{if(++commits===1)throw new Error('lost acknowledgement');return {command:'COMMIT'};}});
 await assert.rejects(f.driver.ingestEnquiry(request),e=>e.outcome==='unknown');
 assert.equal((await f.driver.reconcileEnquiry(request)).replayed,true);assert.equal(records.size,1);
 await assert.rejects(f.driver.reconcileEnquiry({...request,payload:{...payload,fullName:'Changed'}}));await f.driver.shutdown();
});
test('commit timeout remains unknown and destroys the connection',async()=>{
 const f=fixture(undefined,{commit:()=>new Promise(()=>{})});
 await assert.rejects(f.driver.ingestEnquiry(request),e=>e.outcome==='unknown');assert.deepEqual(f.released,[true]);await f.driver.shutdown();
});
test('abort before commit disposes without claiming PostgreSQL cancellation',async()=>{
 const controller=new AbortController();const f=fixture(()=>new Promise(()=>{}));
 const pending=f.driver.ingestEnquiry(request,{signal:controller.signal});setTimeout(()=>controller.abort(),5);
 await assert.rejects(pending,e=>e.outcome==='not-committed');assert.deepEqual(f.released,[true]);await f.driver.shutdown();
});
test('bounded acquisition disposes a late client',async()=>{
 let resolve;const releases=[];const f=fixture(undefined,{connect:()=>new Promise(r=>{resolve=r;})});
 await assert.rejects(f.driver.ingestEnquiry(request));resolve({release:value=>releases.push(value)});
 await new Promise(r=>setImmediate(r));assert.deepEqual(releases,[true]);await f.driver.shutdown();
});
test('admission saturation rejects rather than creating an unbounded acquisition queue',async()=>{
 let connects=0;const f=fixture(undefined,{connect:()=>{connects++;return new Promise(()=>{});}});
 const jobs=[f.driver.ingestEnquiry(request),f.driver.ingestEnquiry(request),f.driver.ingestEnquiry(request)];
 const results=await Promise.allSettled(jobs);assert.equal(connects,2);assert.ok(results.every(r=>r.status==='rejected'));await f.driver.shutdown();
});
test('rate accounting has its own acknowledged transaction before failed ingestion',async()=>{
 const f=fixture(async sql=>{if(sql.includes('consume_enquiry_limit'))return {rows:[{allowed:false}]};throw new Error('ingestion failure');});
 assert.equal(await f.driver.consumeLimit('a'.repeat(64)),false);await assert.rejects(f.driver.ingestEnquiry(request));
 assert.equal(f.calls.filter(([s])=>s==='COMMIT').length,1);await f.driver.shutdown();
});
test('sets statement and lock deadlines and rejects insecure credentials',async()=>{
 const f=fixture();await f.driver.ingestEnquiry(request);
 assert.deepEqual(f.calls.find(([s])=>s.includes('set_config'))[1],['3000','1000']);await f.driver.shutdown();
 assert.throws(()=>createPostgresDriver({ingestion:{...config,ssl:{rejectUnauthorized:false}},notification:config}));
});
test('shutdown closes both pools and denies new work',async()=>{
 const f=fixture();await f.driver.shutdown();assert.ok(f.pools.every(p=>p.ended));await assert.rejects(f.driver.ingestEnquiry(request));
});
test('server lock-timeout error rolls back, sanitizes and disposes before COMMIT',async()=>{
 const f=fixture(async()=>{const error=new Error('synthetic lock details');error.code='55P03';throw error;});
 await assert.rejects(f.driver.ingestEnquiry(request),e=>e.outcome==='not-committed'&&!e.message.includes('lock details'));
 assert.ok(f.calls.some(([s])=>s==='ROLLBACK'));assert.ok(!f.calls.some(([s])=>s==='COMMIT'));assert.deepEqual(f.released,[true]);await f.driver.shutdown();
});
