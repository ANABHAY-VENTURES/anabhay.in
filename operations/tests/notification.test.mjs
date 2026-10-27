import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationWorker} from '../server/notification-worker.mjs';
import {providerOutcome,reconciliationAction} from '../server/provider.mjs';
import {createFakeProvider} from './support/fake-provider.mjs';
import {createMockNotificationStore} from './support/notification-store.mjs';
const make=(f,p,options={})=>createNotificationWorker({store:f.store,provider:p,namespace:'synthetic',...options});
test('mock worker acknowledged acceptance uses immutable key and metadata only',async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider(),w=make(f,p);
 assert.deepEqual(await w.runOnce(),{status:'accepted',providerState:'accepted'});assert.equal(f.row.state,'accepted');
 assert.equal(p.calls(),1);assert.equal(f.metadata[0].kind,'attempt');
 assert.ok(!JSON.stringify(f.metadata).includes('synthetic test notification'));assert.ok(!JSON.stringify(f.metadata).includes('qa@example.invalid'));
 assert.deepEqual(await w.runOnce(),{status:'idle'});await w.shutdown();
});
test('fake provider duplicate keys accept once and reject changed digest',async()=>{
 const p=createFakeProvider();const a=await p.send({key:'synthetic:key',digest:'a'.repeat(64)});
 assert.deepEqual(await p.send({key:'synthetic:key',digest:'a'.repeat(64)}),a);
 await assert.rejects(p.send({key:'synthetic:key',digest:'b'.repeat(64)}));
});
for(const status of ['delivered','pending','failed','unknown'])test(`provider-independent reconciliation: ${status}`,()=>{
 const r=reconciliationAction({status,...(status==='unknown'?{}:{messageId:'fake-1'})});
 assert.equal(r.action,status==='unknown'?'hold':'accept');
 if(status!=='unknown')assert.equal(r.providerState,status);
});
test('mock crash/lost provider acknowledgement recovers same key after lease expiry without another send',async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider({behavior:'lost-ack'}),a=make(f,p);
 assert.deepEqual(await a.runOnce(),{status:'unknown'});assert.equal(f.row.state,'processing');assert.equal(f.metadata[0].kind,'attempt');
 await a.shutdown();f.advance(120001);const b=make(f,p);
 assert.deepEqual(await b.runOnce(),{status:'accepted',providerState:'accepted'});assert.equal(p.calls(),1);
 assert.equal(f.metadata.filter(r=>r.kind==='attempt').length,2);assert.equal(new Set(f.metadata.map(r=>r.key)).size,1);await b.shutdown();
});
test('mock provider acceptance then DB failure reconciles under a new lease',async()=>{
 let fail=true;const f=createMockNotificationStore({hooks:{beforeAccept:()=>{if(fail){fail=false;throw new Error('synthetic private details');}}}}),p=createFakeProvider(),a=make(f,p);
 assert.deepEqual(await a.runOnce(),{status:'unknown'});assert.equal(f.row.state,'processing');await a.shutdown();
 f.advance(120001);const b=make(f,p);assert.equal((await b.runOnce()).status,'accepted');assert.equal(p.calls(),1);await b.shutdown();
});
test('mock lost DB acknowledgement after acceptance never causes another provider send',async()=>{
 const f=createMockNotificationStore({hooks:{afterAccept:()=>{throw new Error('synthetic lost acknowledgement');}}}),p=createFakeProvider(),w=make(f,p);
 assert.equal((await w.runOnce()).status,'unknown');assert.equal(f.row.state,'accepted');assert.equal((await w.runOnce()).status,'idle');assert.equal(p.calls(),1);await w.shutdown();
});
for(const behavior of ['reject','rate-limit','server-error'])test(`mock definite ${behavior} follows bounded database backoff`,async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider({behavior}),w=make(f,p);
 assert.equal((await w.runOnce()).status,'retry-scheduled');assert.equal(f.row.state,'queued');assert.equal(f.row.nextAttempt,300000);
 assert.equal((await w.runOnce()).status,'idle');await w.shutdown();
});
test('mock retry exhaustion preserves intent and never creates attempt eleven',async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider({behavior:'server-error'}),w=make(f,p);
 for(let i=1;i<=10;i++){assert.equal((await w.runOnce()).status,'retry-scheduled');assert.equal(f.row.attempts,i);f.advance(300001);}
 assert.equal(f.row.state,'failed');assert.equal((await w.runOnce()).status,'idle');assert.equal(p.calls(),10);await w.shutdown();
});
test('unknown lookup is quarantined, and provider without lookup or live adapter cannot start',async()=>{
 const f=createMockNotificationStore(),base=createFakeProvider();
 const w=make(f,{...base,lookup:async()=>({status:'unknown'})});assert.equal((await w.runOnce()).status,'held');assert.equal(base.calls(),0);await w.shutdown();
 assert.throws(()=>make(createMockNotificationStore(),createFakeProvider({lookup:false})));
 assert.throws(()=>make(createMockNotificationStore(),{...base,kind:'live'}));
 assert.throws(()=>createNotificationWorker({store:{},provider:base,namespace:'synthetic'}));
});
test('mock stale owner cannot acknowledge or retry after lease reclaim',async()=>{
 const f=createMockNotificationStore(),old=await f.store.claim();f.advance(120001);const next=await f.store.claim();
 assert.notEqual(old.leaseToken,next.leaseToken);await assert.rejects(f.store.accept(old,'fake-1'));await assert.rejects(f.store.retry(old,'timeout'));await assert.rejects(f.store.readContent(old));
});
for(const [name,mutate] of [
 ['wrong team',f=>{f.row.teamId='20000000-0000-4000-8000-000000000002';}],
 ['inactive worker',f=>{f.worker.active=false;}],
 ['insufficient capability',f=>{f.worker.capability='ingestion';}],
 ['inactive team',f=>{f.row.teamActive=false;}],
 ['wrong worker binding',f=>{f.row.workerId='10000000-0000-4000-8000-000000000002';}],
 ['changed immutable snapshot',f=>{f.row.snapshot.text='changed synthetic notification';}]
])test(`mock content boundary denies ${name}`,async()=>{
 const f=createMockNotificationStore(),j=await f.store.claim();mutate(f);await assert.rejects(f.store.readContent(j),e=>e.message==='Notification content unavailable.');
});
test('mock content boundary denies missing job and expired lease',async()=>{
 const f=createMockNotificationStore(),j=await f.store.claim();await assert.rejects(f.store.readContent({...j,id:'30000000-0000-4000-8000-000000000002'}));
 f.advance(120001);await assert.rejects(f.store.readContent(j));
});
test('mock worker rechecks authorization before sending; no content leak on denial',async()=>{
 const f=createMockNotificationStore(),base=createFakeProvider();const p={...base,lookup:async()=>{f.worker.active=false;return {status:'absent'};}};
 const w=make(f,p);assert.equal((await w.runOnce()).status,'unknown');assert.equal(base.calls(),0);await w.shutdown();
});
test('mock timeout retains outstanding state, blocks work and makes unconfirmed shutdown fail',async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider({behavior:'hang-after-accept'}),w=make(f,p,{operationMs:20,shutdownMs:10,leaseMarginMs:1});
 assert.equal((await w.runOnce()).status,'unknown');assert.equal((await w.runOnce()).status,'busy');
 const a=w.shutdown();assert.equal(a,w.shutdown());await assert.rejects(a,e=>e.message==='Notification worker unavailable.');
 assert.equal(w.shutdown(),a);await assert.rejects(w.runOnce());assert.equal(p.calls(),1);
});
test('mock admission limits and shutdown are bounded and reentrant',async()=>{
 let release;const f=createMockNotificationStore({hooks:{claim:()=>new Promise(r=>{release=r;})}}),w=make(f,createFakeProvider(),{concurrency:1});
 const first=w.runOnce();await new Promise(r=>setImmediate(r));assert.equal((await w.runOnce()).status,'busy');release();await first;
 const a=w.shutdown();assert.equal(a,w.shutdown());await a;assert.equal(a,w.shutdown());await assert.rejects(w.runOnce());
});
test('unverified/malformed provider responses remain unknown without raw details',()=>{
 for(const r of [null,{status:'accepted'},{status:'accepted',messageId:'x',body:'synthetic private data'},{status:'rate-limited',retryAfterMs:300001},{status:'sent'}])assert.deepEqual(providerOutcome(r),{status:'unknown'});
});
test('mock expired lease during send rejects database acknowledgement and new owner reconciles',async()=>{
 const f=createMockNotificationStore(),base=createFakeProvider();let expire=true;
 const p={...base,send:async input=>{const r=await base.send(input);if(expire){expire=false;f.advance(120001);}return r;}};
 const a=make(f,p);assert.equal((await a.runOnce()).status,'unknown');assert.equal(f.row.state,'processing');await a.shutdown();
 const b=make(f,p);assert.equal((await b.runOnce()).status,'accepted');assert.equal(base.calls(),1);await b.shutdown();
});
test('mock attempt-marker failure prevents any external send',async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider();f.store.recordAttempt=async()=>{throw new Error('synthetic failure');};
 const w=make(f,p);assert.equal((await w.runOnce()).status,'unknown');assert.equal(p.calls(),0);await w.shutdown();
});
test('mock two concurrent jobs coordinate at claim barrier; third admission denied',async()=>{
 const releases=[];const f=createMockNotificationStore({hooks:{claim:()=>new Promise(r=>releases.push(r))}}),p=createFakeProvider(),w=make(f,p,{concurrency:2});
 const a=w.runOnce(),b=w.runOnce();await new Promise(r=>setImmediate(r));assert.equal(releases.length,2);
 assert.equal((await w.runOnce()).status,'busy');for(const release of releases)release();
 const outcomes=await Promise.all([a,b]);assert.deepEqual(outcomes.map(x=>x.status).sort(),['accepted','idle']);assert.equal(p.calls(),1);await w.shutdown();
});
test('mock accepted tenth attempt remains accepted on repeated claim',async()=>{
 const f=createMockNotificationStore();f.row.attempts=9;const p=createFakeProvider(),w=make(f,p);
 assert.equal((await w.runOnce()).status,'accepted');assert.equal(f.row.attempts,10);
 assert.equal((await w.runOnce()).status,'idle');assert.equal(f.row.state,'accepted');assert.equal(p.calls(),1);await w.shutdown();
});
for(const state of ['delivered','pending','failed'])test(`mock worker preserves lookup ${state} evidence without resending`,async()=>{
 const f=createMockNotificationStore(),p=createFakeProvider(),key=`synthetic:${f.row.id}`;
 await p.send({key,digest:f.row.snapshotDigest});p.setState(key,state);const w=make(f,p);
 assert.deepEqual(await w.runOnce(),{status:'accepted',providerState:state});assert.equal(p.calls(),1);
 assert.equal(f.metadata.find(r=>r.kind==='observation').status,state);assert.equal(f.row.state,'accepted');await w.shutdown();
});
