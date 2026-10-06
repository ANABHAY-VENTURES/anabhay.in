import test from 'node:test';
import assert from 'node:assert/strict';
import {makePayload,validateEnquiry} from '../js/enquiry-validation.js';
import {submitEnquiry} from '../js/enquiry-api.js';
const valid=()=>({schemaVersion:1,fullName:'Example Builder',workEmail:'builder@example.test',phone:null,organisation:null,projectType:'software-web',description:'We need a tool to organise our internal workflow.',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'});
const fakeLocation={origin:'https://website.example.test'};
test('valid payload and normalization of optional fields',()=>{
 assert.deepEqual(validateEnquiry(valid()),{});
 const data=new FormData();for(const [key,value]of Object.entries(valid()))if(value!==null)data.set(key,key==='consent'?'on':String(value));data.set('fullName','  Example Builder  ');
 const p=makePayload(data);assert.equal(p.fullName,'Example Builder');assert.equal(p.phone,null);assert.equal(p.consent,true);
});
test('reject required fields, unsupported types, invalid email, and absent consent',()=>{
 const p={...valid(),fullName:' ',workEmail:'bad',projectType:'invented',description:'short',consent:false};
 assert.deepEqual(Object.keys(validateEnquiry(p)),['fullName','workEmail','projectType','description','consent']);
});
test('phone preference needs usable phone; upper bounds enforced',()=>{
 assert.ok(validateEnquiry({...valid(),preferredContactMethod:'phone'}).phone);
 assert.ok(validateEnquiry({...valid(),phone:'123'}).phone);
 assert.ok(validateEnquiry({...valid(),phone:'+12 345 678 901 234 567'}).phone);
 assert.deepEqual(validateEnquiry({...valid(),phone:'+91 98765 43210',preferredContactMethod:'phone'}),{});
 const p={...valid(),fullName:'a'.repeat(121),organisation:'a'.repeat(161),description:'a'.repeat(5001)};
 assert.deepEqual(Object.keys(validateEnquiry(p)),['fullName','organisation','description']);
});
test('unconfigured adapter rejects without any network activity',async()=>{
 let calls=0;await assert.rejects(submitEnquiry(valid(),{fetchImpl:async()=>{calls++;}}),/not been sent or saved/);assert.equal(calls,0);
});
test('API requires explicit durable receipt and sends idempotency key',async()=>{
 globalThis.location=fakeLocation;
 let options;
 const fetchImpl=async(url,o)=>{assert.equal(url,'https://website.example.test/api/enquiries');options=o;return {ok:true,json:async()=>({persisted:true,enquiryId:'test-only-id',notification:'queued'})};};
 const receipt=await submitEnquiry(valid(),{endpoint:'/api/enquiries',requestId:'test-request',fetchImpl});assert.equal(receipt.persisted,true);assert.equal(options.headers['Idempotency-Key'],'test-request');assert.equal(options.credentials,'omit');
});
test('reject HTTP failure, missing persistence, malformed receipts, and network errors',async()=>{
 globalThis.location=fakeLocation;
 for(const receipt of [{success:true},{persisted:false,enquiryId:'x',notification:'queued'},{persisted:true,enquiryId:'',notification:'queued'},{persisted:true,enquiryId:'x',notification:'failed'}]){
  await assert.rejects(submitEnquiry(valid(),{endpoint:'/api/enquiries',requestId:'x',fetchImpl:async()=>({ok:true,json:async()=>receipt})}),/did not confirm/);
 }
 await assert.rejects(submitEnquiry(valid(),{endpoint:'/api/enquiries',requestId:'x',fetchImpl:async()=>({ok:false})}),/could not confirm/);
 await assert.rejects(submitEnquiry(valid(),{endpoint:'/api/enquiries',requestId:'x',fetchImpl:async()=>{throw new TypeError('offline');}}),/could not be confirmed/);
});
test('reject other origins and missing request id before network',async()=>{
 globalThis.location=fakeLocation;
 await assert.rejects(submitEnquiry(valid(),{endpoint:'https://other.example.test/api'}),/unavailable/);
 await assert.rejects(submitEnquiry(valid(),{endpoint:'/api/enquiries'}),/could not start/);
});
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('homepage motion preference and visibility stop the animation loop',()=>{
 const code=readFileSync(new URL('../script.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 let reduced=true,hidden=false,requested=0,cancelled=0;
 const handlers={},motion={get matches(){return reduced;},addEventListener:(event,handler)=>handlers.motion=handler};
 const ctx={clearRect(){},setTransform(){},beginPath(){},arc(){},fill(){}};
 const canvas={getContext:()=>ctx};
 const doc={get hidden(){return hidden;},getElementById:()=>canvas,querySelector:()=>({style:{}}),addEventListener:(event,handler)=>handlers[event]=handler};
 runInNewContext(code,{document:doc,matchMedia:q=>q.includes('reduce')?motion:{matches:true},innerWidth:390,innerHeight:844,devicePixelRatio:1,addEventListener(){},requestAnimationFrame:()=>++requested,cancelAnimationFrame:()=>cancelled++});
 assert.equal(requested,0,'no frame requested when reduced motion is active');
 reduced=false;handlers.motion();assert.equal(requested,1);
 hidden=true;handlers.visibilitychange();assert.equal(requested,1);assert.ok(cancelled>=3);
 hidden=false;reduced=true;handlers.motion();assert.equal(requested,1);
});
