import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {createPostgresDriver} from '../../server/postgres.mjs';

const [run]=process.argv.slice(2);
if(!/^[a-f0-9-]{36}$/.test(run??''))throw new Error('INVALID_LOCAL_RUN');
const secrets=JSON.parse(fs.readFileSync('/tmp/review-credentials.json'));
const base={host:'127.0.0.1',expectedHost:'127.0.0.1',port:5432,database:'postgres',ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/tmp/review-ca.crt')},max:1};
const started=performance.now(),clients=[],drivers=[];let failed=false,holder;
const emit=data=>console.log(JSON.stringify({stage:'outbox',elapsedMs:Math.round(performance.now()-started),...data}));
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('OUTBOX_TEST_DEADLINE')),ms);})]);}finally{clearTimeout(timer);}}
async function client(role,label){const c=new pg.Client({...base,user:role==='observer'?'synthetic_observer':'synthetic_notification',password:secrets[role],application_name:`campaign-${run}-${label}`,connectionTimeoutMillis:1000,statement_timeout:1000,lock_timeout:500});c.on('error',()=>{});clients.push(c);await c.connect();emit({role:label,backendPid:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid});return c;}
async function until(check){const deadline=performance.now()+2000;do{if(await check())return;await delay(20);}while(performance.now()<deadline);throw new Error('OUTBOX_CLEANUP_DEADLINE');}
function driver(){const d=createPostgresDriver({ingestion:{...base,user:'synthetic_ingestion',password:secrets.ingestion},notification:{...base,user:'synthetic_notification',password:secrets.notification}});drivers.push(d);return d;}
async function denied(c,text,args){try{await c.query(text,args);assert.fail('Expected denial');}catch(error){assert.equal(error.code,'P0001');assert.equal(error.message,'Invalid notification lease');}}
try{
 const observer=await client('observer','outbox-observer');
 const initial=(await observer.query('SELECT id,state,attempts,lease_token,lease_until FROM operations.notification_outbox ORDER BY id')).rows;
 assert.equal(initial.length,2);assert.ok(initial.every(row=>row.state==='processing'&&row.attempts===1&&row.lease_token&&row.lease_until));
 emit({test:'legacy worker commits verified independently',rows:2,result:'PASS'});
 // Fixture time adjustment only. Security policies and constraints remain intact.
 await observer.query("UPDATE operations.notification_outbox SET lease_until=clock_timestamp()-interval '1 second'");
 holder=await client('notification','outbox-holder');const holderPid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 await holder.query('BEGIN');const held=(await holder.query('SELECT operations.claim_notification() job')).rows[0].job;
 assert.ok(held?.id&&held.leaseToken);assert.equal(held.attempt,2);
 const locks=(await observer.query("SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='transactionid' AND granted",[holderPid])).rowCount;assert.ok(locks>0);
 const d=driver();const peer=await bounded(d.claimNotification(),1500);
 assert.ok(peer?.id&&peer.leaseToken);assert.notEqual(peer.id,held.id);assert.equal(peer.attempt,2);
 const holderState=(await observer.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[holderPid])).rows[0].state;
 assert.equal(holderState,'idle in transaction');
 const visible=(await observer.query('SELECT id,attempts FROM operations.notification_outbox ORDER BY id')).rows;
 assert.equal(visible.find(row=>row.id===held.id).attempts,1);assert.equal(visible.find(row=>row.id===peer.id).attempts,2);
 emit({test:'deterministic overlapping claims use distinct live leases',holderPid,result:'PASS'});
 assert.equal(await d.claimNotification(),null);emit({test:'single available job locked; other live lease cannot be reclaimed',result:'PASS'});
 // Simulate a worker crash before claim COMMIT: close its real connection.
 await holder.end();holder=null;await until(async()=>!(await observer.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[holderPid])).rowCount);
 assert.equal((await observer.query('SELECT attempts FROM operations.notification_outbox WHERE id=$1',[held.id])).rows[0].attempts,1);
 const replacement=await d.claimNotification();assert.equal(replacement.id,held.id);assert.equal(replacement.attempt,2);assert.notEqual(replacement.leaseToken,held.leaseToken);
 emit({test:'pre-COMMIT worker crash rolls back claim; safe reclaim',result:'PASS'});
 const stale=await client('notification','outbox-stale');
 for(const original of initial){
  await denied(stale,'SELECT operations.accept_notification($1,$2,$3)',[original.id,original.lease_token,'synthetic-provider-id']);
  await denied(stale,'SELECT operations.retry_notification($1,$2,$3)',[original.id,original.lease_token,'timeout']);
 }
 await denied(stale,'SELECT operations.accept_notification($1,$2,$3)',[replacement.id,held.leaseToken,'synthetic-provider-id']);
 emit({test:'expired and rolled-back stale tokens cannot acknowledge or retry',result:'PASS'});
 await assert.rejects(stale.query('SELECT * FROM operations.notification_outbox'),error=>error.code==='42501');
 await assert.rejects(stale.query("UPDATE operations.notification_outbox SET state='accepted'"),error=>error.code==='42501');
 emit({test:'notification LOGIN cannot directly read or mutate outbox',result:'PASS'});
 await stale.query('BEGIN');await stale.query('SELECT operations.accept_notification($1,$2,$3)',[replacement.id,replacement.leaseToken,'synthetic-provider-id']);
 await stale.query('ROLLBACK');assert.equal((await observer.query('SELECT state FROM operations.notification_outbox WHERE id=$1',[replacement.id])).rows[0].state,'processing');
 emit({test:'database acceptance rollback preserves processing intent',result:'PASS'});
 await d.acceptNotification(replacement.id,replacement.leaseToken,'synthetic-provider-id');
 const accepted=(await observer.query('SELECT state,provider_message_id,accepted_at,lease_token FROM operations.notification_outbox WHERE id=$1',[replacement.id])).rows[0];
 assert.equal(accepted.state,'accepted');assert.equal(accepted.provider_message_id,'synthetic-provider-id');assert.ok(accepted.accepted_at);assert.equal(accepted.lease_token,null);
 await denied(stale,'SELECT operations.retry_notification($1,$2,$3)',[replacement.id,replacement.leaseToken,'timeout']);
 emit({test:'valid acknowledgement commits; accepted intent cannot retry',result:'PASS',delivery:'NOT_TESTED'});
 await d.retryNotification(peer.id,peer.leaseToken,'timeout');
 let scheduled=(await observer.query('SELECT state,attempts,next_attempt_at>clock_timestamp() due_later,extract(epoch FROM next_attempt_at-clock_timestamp()) delay_seconds,lease_token FROM operations.notification_outbox WHERE id=$1',[peer.id])).rows[0];
 assert.equal(scheduled.state,'queued');assert.equal(scheduled.attempts,2);assert.equal(scheduled.due_later,true);assert.equal(scheduled.lease_token,null);assert.equal(await d.claimNotification(),null);
 assert.ok(Number(scheduled.delay_seconds)>=295&&Number(scheduled.delay_seconds)<=300);
 emit({test:'five-minute retry schedule blocks immediate claim',result:'PASS'});
 for(let attempt=3;attempt<=10;attempt++){
  await observer.query("UPDATE operations.notification_outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[peer.id]);
  const job=await d.claimNotification();assert.equal(job.id,peer.id);assert.equal(job.attempt,attempt);await d.retryNotification(job.id,job.leaseToken,'unavailable');
 }
 assert.equal((await observer.query('SELECT state FROM operations.notification_outbox WHERE id=$1',[peer.id])).rows[0].state,'failed');assert.equal(await d.claimNotification(),null);
 emit({test:'retry exhaustion stops at ten; durable rows retained',result:'PASS'});
 await observer.query("UPDATE operations.notification_outbox SET state='processing',lease_until=clock_timestamp()-interval '1 second',lease_token=gen_random_uuid() WHERE id=$1",[peer.id]);
 assert.equal(await d.claimNotification(),null);assert.equal((await observer.query('SELECT state FROM operations.notification_outbox WHERE id=$1',[peer.id])).rows[0].state,'failed');
 emit({test:'expired exhausted lease fails without an eleventh attempt',result:'PASS'});
 const counts=(await observer.query('SELECT (SELECT count(*)::int FROM operations.leads) leads,(SELECT count(*)::int FROM operations.website_enquiries) enquiries,(SELECT count(*)::int FROM operations.notification_outbox) outbox')).rows[0];assert.deepEqual(counts,{leads:2,enquiries:2,outbox:2});
 // Existing fixture hash/payload are repeated exactly; no new idempotency key.
 const fixture={schemaVersion:1,fullName:'Synthetic Claims',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic concurrent claim enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
 const ingestion=new pg.Client({...base,user:'synthetic_ingestion',password:secrets.ingestion,application_name:`campaign-${run}-outbox-replay`});ingestion.on('error',()=>{});clients.push(ingestion);await ingestion.connect();
 for(const key of ['30000000-0000-4000-8000-000000000092','30000000-0000-4000-8000-000000000093']){
  const receipt=(await ingestion.query('SELECT operations.ingest_enquiry($1,$2,$3::jsonb) receipt',[key,'a'.repeat(64),JSON.stringify(fixture)])).rows[0].receipt;assert.equal(receipt.replayed,true);
 }
 assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_outbox')).rows[0].n,2);
 emit({test:'crash/retry/idempotent replay create no duplicate outbox rows',rows:2,result:'PASS'});
 emit({test:'real provider delivery',result:'BLOCKED',reason:'Worker/provider/content-reader implementation absent'});
}catch(error){failed=true;emit({result:'FAIL',code:/^[0-9A-Z_]+$/.test(error.code??'')?error.code:'HARNESS_OR_ASSERTION_FAILURE'});}
finally{
 if(holder){try{await bounded(holder.query('ROLLBACK'),1000);}catch{failed=true;emit({result:'FAIL',reason:'HOLDER_RELEASE_UNCONFIRMED'});}}
 for(const [name,operation,ms] of [['drivers',()=>Promise.all(drivers.map(d=>d.shutdown())),8000],['clients',()=>Promise.all(clients.map(c=>c.end())),2000]]){
  try{await bounded(operation(),ms);}catch{failed=true;emit({result:'FAIL',reason:'CLEANUP_UNCONFIRMED',phase:name});}
 }
}
process.exitCode=failed?1:0;
