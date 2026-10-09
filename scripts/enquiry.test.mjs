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
test('contact HTML and generator have no native submission mechanism',()=>{
 for (const path of ['../contact/index.html','./generate-pages.mjs']) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.doesNotMatch(source,/<form\b/i);
  assert.match(source,/<div id="enquiry-form" role="group" aria-label="Enquiry details"/);
  const button=source.match(/<button\b[^>]*>Review enquiry/)?.[0];
  assert.ok(button);
  assert.match(button,/type="button"/);
  assert.match(button,/\sdisabled(?:\s|>)/);
  assert.doesNotMatch(source,/\b(?:form|formaction|formmethod)\s*=/);
  assert.doesNotMatch(source,/<(?:button|input)\b[^>]*type="(?:submit|image)"/);
  assert.match(source,/Online submission is not yet available\./);
  assert.match(source,/<noscript><p>JavaScript is needed to review this form\./);
 }
});

test('contact template and generated page expose the exact owner-approved email route',()=>{
 for(const path of ['../contact/index.html','./generate-pages.mjs']) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  const aside=source.match(/<aside>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(aside,'direct contact remains outside the form and available without JavaScript');
  const links=[...aside.matchAll(/<a\b[^>]*href="(mailto:[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length,1);
  assert.equal(links[0][1],'mailto:anabhayventures@gmail.com');
  assert.match(links[0][2],/Email: anabhayventures@gmail\.com/);
  assert.match(aside,/available contact routes while online form submission is unavailable/);
 }
});

test('contact template and generated page expose the exact WhatsApp route with protected new-tab behavior',()=>{
 for(const path of ['../contact/index.html','./generate-pages.mjs']) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  const aside=source.match(/<aside>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(aside);
  const links=[...aside.matchAll(/<a\b[^>]*href="(https:\/\/wa\.me\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length,1);
  assert.equal(links[0][1],'https://wa.me/919832977184');
  assert.match(links[0][0],/target="_blank"/);
  const rel=links[0][0].match(/rel="([^"]*)"/)?.[1].split(/\s+/)||[];
  assert.ok(rel.includes('noopener'));
  assert.ok(rel.includes('noreferrer'));
  assert.match(links[0][2],/WhatsApp: \+91 98329 77184 \(opens in a new tab\)/);
 }
});

// Exercise the actual controller with imported dependencies and a minimal DOM,
// matching the existing VM test convention. This is not browser verification.
function contactController({missingError=false,failInputRegistration=false,unsupported=false}={}) {
 const code=readFileSync(new URL('../js/contact.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 const handlers={},attributes=new Map(),fields=new Map(),nodes=new Map();
 let networkCalls=0,payloadReads=0;
 const button={
  addEventListener(name,handler){handlers[name]=handler;},
  _disabled:true,
  get disabled(){return this._disabled;},
  set disabled(value){
   if(!value)assert.deepEqual(Object.keys(handlers),['click','input','keydown'],'all handlers must exist before enabling');
   this._disabled=value;
  }
 };
 const status={textContent:'',focus(){this.focused=true;}};
 for(const name of ['fullName','workEmail','phone','organisation','projectType','description','preferredContactMethod','consent']) {
  fields.set(name,{value:valid()[name] ?? '',checked:true,setAttribute(){},removeAttribute(){},focus(){}});
  nodes.set(`${name}-error`,{textContent:''});
 }
 if(missingError)nodes.delete('consent-error');
 const form={
  querySelector:selector=>selector.startsWith('button')?button:fields.get(selector.match(/name="([^"]+)"/)[1]),
  addEventListener(name,handler){
   if(name==='input'&&failInputRegistration)throw new Error('Synthetic initialization failure');
   handlers[name]=handler;
  },
  setAttribute:(name,value)=>attributes.set(name,value),
  removeAttribute:name=>attributes.delete(name),
  reset(){throw new Error('Unconfigured form must not reset as successful');}
 };
 nodes.set('enquiry-form',form);nodes.set('form-status',status);

 runInNewContext(code,{
  document:{getElementById:id=>nodes.get(id)},makePayload:data=>{payloadReads++;return makePayload(data);},validateEnquiry,
  crypto:unsupported?{}:{randomUUID:()=> 'synthetic-request-id'},
  submitEnquiry:(payload,options)=>submitEnquiry(payload,{...options,fetchImpl:async()=>{networkCalls++;throw new Error('Unexpected network');}})
 });
 return {button,status,handlers,attributes,get networkCalls(){return networkCalls;},get payloadReads(){return payloadReads;}};
}

test('successful contact initialization enables button review while API is unavailable',async()=>{
 const controller=contactController();
 assert.equal(controller.button.disabled,false);
 await controller.handlers.click();
 assert.equal(controller.payloadReads,1);
 assert.equal(controller.networkCalls,0);
 assert.match(controller.status.textContent,/not been sent or saved/);
 assert.equal(controller.button.disabled,false);
 assert.equal(controller.attributes.has('aria-busy'),false);
 assert.equal(controller.status.focused,true);
});

test('incomplete contact initialization leaves review disabled with safe unavailable messaging',()=>{
 const controller=contactController({missingError:true});
 assert.equal(controller.button.disabled,true);
 assert.deepEqual(Object.keys(controller.handlers),[]);
 assert.match(controller.status.textContent,/review is unavailable.*not been sent or saved/);
 assert.equal(controller.networkCalls,0);
});

test('partial contact initialization cannot process a review or enable review',async()=>{
 const controller=contactController({failInputRegistration:true});
 assert.equal(controller.button.disabled,true);
 await controller.handlers.click();
 assert.equal(controller.payloadReads,0);
 assert.equal(controller.networkCalls,0);
 assert.match(controller.status.textContent,/review is unavailable.*not been sent or saved/);
});

test('unsupported review environment remains disabled without reading form data or using the network',()=>{
 const controller=contactController({unsupported:true});
 assert.equal(controller.button.disabled,true);
 assert.equal(controller.payloadReads,0);
 assert.equal(controller.networkCalls,0);
 assert.match(controller.status.textContent,/review is unavailable/);
});

test('Enter is inert in single-line inputs and preserves textarea and button behavior',()=>{
 const controller=contactController();
 for(const tagName of ['INPUT','TEXTAREA','BUTTON','SELECT']){
  let prevented=false;
  controller.handlers.keydown({key:'Enter',target:{tagName},preventDefault(){prevented=true;}});
  assert.equal(prevented,tagName==='INPUT');
 }
 assert.equal(controller.payloadReads,0);
 assert.equal(controller.networkCalls,0);
});

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
