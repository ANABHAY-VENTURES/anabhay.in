import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startLocalEnquiry,createSyntheticIngestionProcess,developmentOrigin} from '../server/local-http.mjs';
const key='00000000-0000-4000-8000-000000000001';
const payload={schemaVersion:1,fullName:'QA Example',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic test enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
async function open(t,options={}){const local=await startLocalEnquiry({developmentOptIn:true,...options});t.after(()=>local.close());assert.equal(local.address.address,'127.0.0.1');return local;}
function send(local,{body=JSON.stringify(payload),headers={},stall=false}={}){
 return new Promise((resolve,reject)=>{
  const request=http.request({host:'127.0.0.1',port:local.address.port,path:'/enquiries',method:'POST',headers:{Origin:developmentOrigin,'Content-Type':'application/json','Idempotency-Key':key,...headers}},response=>{
   let text='';response.setEncoding('utf8');response.on('data',s=>text+=s);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(text)}));response.on('error',reject);
  });request.on('error',reject);request.setTimeout(2000,()=>request.destroy(new Error('Test watchdog')));
  if(stall){request.flushHeaders();request.write('{');}else request.end(body);
 });
}
test('listener refuses default startup, non-loopback and unrecognized configuration',async()=>{
 for(const options of [{},{developmentOptIn:true,host:'0.0.0.0'},{developmentOptIn:true,databaseUrl:'forbidden'},{developmentOptIn:true,enabled:true}])await assert.rejects(startLocalEnquiry(options));
});
test('loopback transport preserves committed/replay/conflict receipt contracts with memory fake',async t=>{
 const local=await open(t);const first=await send(local),repeat=await send(local);
 assert.equal(first.status,201);assert.equal(first.body.persisted,true);assert.equal(first.body.notification,'queued');assert.equal(repeat.status,200);assert.equal(first.body.enquiryId,repeat.body.enquiryId);
 assert.equal((await send(local,{body:JSON.stringify({...payload,fullName:'Other QA'})})).status,409);
});
test('invalid, oversized and invalid UTF-8 requests retain 422',async t=>{
 const local=await open(t);
 for(const body of ['{','x'.repeat(16385),Buffer.from([0xc3,0x28])])assert.equal((await send(local,{body})).status,422);
});
test('forwarding headers cannot bypass socket-based rate identity; malformed attempt counts',async t=>{
 const local=await open(t,{createProcess:()=>createSyntheticIngestionProcess({limit:1})});
 assert.equal((await send(local,{body:'{',headers:{'X-Forwarded-For':'192.0.2.1'}})).status,422);
 assert.equal((await send(local,{headers:{'X-Forwarded-For':'192.0.2.2'}})).status,429);
});
test('unavailable ingestion returns sanitized 503',async t=>{
 const local=await open(t,{createProcess:()=>({capabilities:{abuseCheck:async()=>true,persist:async()=>{throw Error('private SQL details');}},shutdown:async()=>{}})});
 const response=await send(local);assert.equal(response.status,503);assert.deepEqual(response.body,{error:'Service unavailable.'});
});
test('stalled body receives safe 408',async t=>{
 const local=await open(t,{bodyDeadlineMs:25,requestDeadlineMs:500});
 assert.equal((await send(local,{stall:true})).status,408);
});
test('whole-request deadline bounds unavailable capability without claiming cancellation',async t=>{
 let settle;const pending=new Promise(r=>settle=r);
 const local=await open(t,{bodyDeadlineMs:20,requestDeadlineMs:30,createProcess:()=>({capabilities:{abuseCheck:()=>pending,persist:async()=>assert.fail('must not persist')},shutdown:async()=>{}})});
 try{assert.equal((await send(local)).status,503);}finally{settle(true);await new Promise(resolve=>setImmediate(resolve));}
});
test('host and origin checks deny unapproved requests',async t=>{
 const local=await open(t);
 assert.equal((await send(local,{headers:{Host:'other.invalid'}})).status,403);
 assert.equal((await send(local,{headers:{Origin:'https://other.invalid'}})).status,403);
});
