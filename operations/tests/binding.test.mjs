import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createNotificationDriver} from '../server/postgres.mjs';
import {createPostgresNotificationStore} from '../server/notification-store.mjs';
import {releaseNotificationHold} from '../server/capabilities.mjs';
test('bound driver retains one capability pool and exposes no legacy/raw SQL fallback',async()=>{
 let pools=0;class Pool extends EventEmitter{constructor(){super();pools++;}async end(){}}
 const c={host:'test.example.invalid',expectedHost:'test.example.invalid',database:'synthetic',user:'synthetic_worker',password:'synthetic-only',ssl:{rejectUnauthorized:true}};
 const d=createNotificationDriver(c,{persistence:true},{Pool});assert.equal(pools,1);assert.equal(d.claimNotification,undefined);assert.equal(d.query,undefined);assert.equal(d.ingestEnquiry,undefined);
 const store=createPostgresNotificationStore(d);assert.equal(store.release,undefined);assert.equal(store.query,undefined);await store.shutdown();
});
test('bound adapter rejects legacy capabilities and altered canonical snapshot digest',async()=>{
 assert.throws(()=>createPostgresNotificationStore({claimNotification(){}}));
 const driver=Object.fromEntries(['claim','readContent','recordAttempt','recordObservation','finish','status','shutdown'].map(k=>[k,async()=>{}]));
 driver.readContent=async()=>({snapshot:{destination:'qa@example.invalid',templateVersion:'v1',text:'synthetic'},digest:'a'.repeat(64),leaseRemainingMs:120000});
 await assert.rejects(createPostgresNotificationStore(driver).readContent({}));
});
test('new migration has explicit non-human identity, scoped fencing, legacy revocation and manager-only release',()=>{
 const sql=readFileSync(new URL('../migrations/006_notification_capabilities.sql',import.meta.url),'utf8');
 assert.match(sql,/rolname=session_user/);assert.match(sql,/s\.team_id is not null/);assert.match(sql,/l\.team_id=s\.team_id/);
 assert.match(sql,/staff\.role='manager'/);assert.match(sql,/notification_release_events/);assert.match(sql,/revoke execute on function operations\.claim_notification/);
 assert.doesNotMatch(sql,/grant.*bypassrls|grant.*service_role|create or replace|grant.*on auth\.users/i);
});
test('mock release wrapper preserves verified user JWT and rejects supplied actor/role',async()=>{
 const id='90000000-0000-4000-8000-000000000001';let calls=0;
 const client={auth:{getUser:async()=>({data:{user:{id}}})},schema:s=>{assert.equal(s,'operations');return {rpc:async(n,args)=>{calls++;assert.equal(n,'release_notification_hold');assert.deepEqual(args,{p_id:id,p_request:id,p_reason:'Synthetic review'});return {error:null};}};}};
 assert.deepEqual(await releaseNotificationHold({outboxId:id,requestId:id,reason:'Synthetic review'},{verifiedUserClient:client}),{released:true});
 await assert.rejects(releaseNotificationHold({outboxId:id,requestId:id,actorId:id},{verifiedUserClient:client}));
 await assert.rejects(releaseNotificationHold({outboxId:id,requestId:id,reason:'Synthetic review'},{verifiedUserClient:{auth:{getUser:async()=>({error:true})}}}),e=>e.status===403);assert.equal(calls,1);
 const uncertain={...client,schema:()=>({rpc:async()=>{throw new Error('synthetic private response');}})};
 await assert.rejects(releaseNotificationHold({outboxId:id,requestId:id,reason:'Synthetic review'},{verifiedUserClient:uncertain}),e=>e.status===503&&!e.message.includes('private'));
});
