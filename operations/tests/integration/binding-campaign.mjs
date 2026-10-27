// Real PostgreSQL + concrete driver/store/worker. Provider is deterministic FAKE.
// Staff Auth claims use the local shim, NOT hosted Supabase/JWT evidence.
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createNotificationDriver} from '../../server/postgres.mjs';
import {createPostgresNotificationStore} from '../../server/notification-store.mjs';
import {createNotificationWorker} from '../../server/notification-worker.mjs';
import {createFakeProvider} from '../support/fake-provider.mjs';
import {createCommitFaultProxy} from './commit-fault-proxy.mjs';
const [run]=process.argv.slice(2);if(!/^[a-f0-9-]{36}$/.test(run??''))throw new Error('INVALID_LOCAL_RUN');
const secrets=JSON.parse(fs.readFileSync('/tmp/review-credentials.json')),ca=fs.readFileSync('/tmp/review-ca.crt');
const base={host:'127.0.0.1',expectedHost:'127.0.0.1',port:5432,database:'postgres',ssl:{rejectUnauthorized:true,ca},max:1};
const clients=[],drivers=[],workers=[],proxies=[],pending=[];let failed=false,phase='connect';
const emit=x=>console.log(JSON.stringify({stage:'binding',...x}));
async function bounded(p,ms=4000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DEADLINE')),ms);})]);}finally{clearTimeout(timer);}}
async function client(label,user='synthetic_observer',password=secrets.observer){const c=new pg.Client({...base,user,password,application_name:`campaign-${run}-${label}`,statement_timeout:1500,lock_timeout:500});c.on('error',()=>{});clients.push(c);await c.connect();emit({role:label,backendPid:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid});return c;}
function driver(user='synthetic_notification',password=secrets.notification,port=5432,authority=ca){const d=createNotificationDriver({...base,user,password,port,ssl:{rejectUnauthorized:true,ca:authority}},{persistence:true});drivers.push(d);return d;}
async function denied(c,sql,args=[],code='42501'){await assert.rejects(c.query(sql,args),e=>e.code===code);}
const id=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const teamA=id(1),teamB=id(2),teamInactive=id(3),workerA=id(4),workerB=id(5),manager=id(6),member=id(7),owner=id(8);
const payload={schemaVersion:1,fullName:'Synthetic Scope',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic scoped enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
const canonical=JSON.stringify({destination:'qa@example.invalid',templateVersion:'synthetic-v1',text:'synthetic minimal notification'});
let observer,cA,cB,dA,dB,sA,sB;
async function enqueue(n,team,snapshotTeam=team){const receipt=(await observer.query('SELECT operations.ingest_enquiry($1,$2,$3::jsonb) receipt',[id(n),'a'.repeat(64),JSON.stringify(payload)])).rows[0].receipt;
 const row=(await observer.query('SELECT o.id,e.lead_id FROM operations.notification_outbox o JOIN operations.website_enquiries e ON e.id=o.enquiry_id WHERE e.id=$1',[receipt.enquiryId])).rows[0];
 await observer.query('UPDATE operations.leads SET team_id=$1 WHERE id=$2',[team,row.lead_id]);
 await observer.query('INSERT INTO operations.notification_snapshots(outbox_id,team_id,namespace,canonical_payload) VALUES($1,$2,$3,$4)',[row.id,snapshotTeam,'synthetic',canonical]);return {id:row.id,enquiryId:receipt.enquiryId};}
async function marker(store,job){const c=await store.readContent(job);const r={key:`synthetic:${job.id}`,digest:c.digest};await store.recordAttempt(job,r);return r;}
try{
 observer=await client('observer');phase='provision';
 assert.deepEqual((await observer.query('SELECT version FROM operations.migration_versions ORDER BY version')).rows.map(r=>r.version),[1,2,3,4,5,6]);
 const passwordB=randomBytes(32).toString('hex');
 await observer.query(`CREATE ROLE synthetic_notification_b LOGIN INHERIT PASSWORD '${passwordB}'; GRANT ops_notification_api TO synthetic_notification_b`);
 await observer.query('INSERT INTO operations.teams(id,name,active) VALUES($1,$2,true),($3,$4,true),($5,$6,false)',[teamA,'Synthetic A',teamB,'Synthetic B',teamInactive,'Synthetic Inactive']);
 await observer.query("INSERT INTO operations.notification_workers(id,database_role_oid,active) SELECT $1,oid,true FROM pg_roles WHERE rolname='synthetic_notification'",[workerA]);
 await observer.query("INSERT INTO operations.notification_workers(id,database_role_oid,active) SELECT $1,oid,true FROM pg_roles WHERE rolname='synthetic_notification_b'",[workerB]);
 await observer.query('INSERT INTO operations.notification_worker_teams VALUES($1,$2),($3,$4),($1,$5)',[workerA,teamA,workerB,teamB,teamInactive]);
 cA=await client('worker-a','synthetic_notification',secrets.notification);cB=await client('worker-b','synthetic_notification_b',passwordB);
 dA=driver();dB=driver('synthetic_notification_b',passwordB);sA=createPostgresNotificationStore(dA);sB=createPostgresNotificationStore(dB);
 phase='ACL';
 for(const c of [cA,cB]){
  for(const t of ['leads','website_enquiries','notification_snapshots','notification_workers','notification_worker_teams','notification_attempts','notification_observations','notification_actions','notification_holds','notification_release_events'])await denied(c,`SELECT * FROM operations.${t}`);
  await denied(c,'SELECT operations.claim_notification()');await denied(c,'SELECT operations.bound_worker()');await denied(c,'SELECT operations.release_notification_hold($1,$2)',[id(99),id(98)]);
  assert.equal((await observer.query("SELECT pg_has_role($1,'ops_notification_bound_executor','MEMBER') access",[c===cA?'synthetic_notification':'synthetic_notification_b'])).rows[0].access,false);
 }
 emit({test:'worker direct-data/helper/manager/legacy denial; no executor membership',result:'PASS'});
 const privateRole='ops_notification_bound_executor';
 assert.equal((await observer.query("SELECT has_schema_privilege($1,'auth','USAGE') access",[privateRole])).rows[0].access,false);
 assert.equal((await observer.query("SELECT has_schema_privilege($1,'operations','CREATE') access",[privateRole])).rows[0].access,false);
 assert.equal((await observer.query("SELECT rolcanlogin OR rolbypassrls OR rolsuper OR rolcreaterole OR rolcreatedb unsafe FROM pg_roles WHERE rolname=$1",[privateRole])).rows[0].unsafe,false);
 await observer.query('SET ROLE ops_notification_bound_executor');await denied(observer,'SELECT name,email,message FROM operations.leads');await denied(observer,'SELECT * FROM auth.users');await observer.query('RESET ROLE');
 emit({test:'private owner is NOLOGIN/NOBYPASSRLS, no schema CREATE/auth USAGE or arbitrary lead PII columns',result:'PASS'});
 phase='scope';const qa=await enqueue(10,teamA),qb=await enqueue(11,teamB),qu=await enqueue(12,null),qi=await enqueue(13,teamInactive),qm=await enqueue(14,teamB,teamA);
 const [ja,jb]=await Promise.all([sA.claim(),sB.claim()]);assert.equal(ja.id,qa.id);assert.equal(jb.id,qb.id);
 assert.ok((await sA.readContent(ja)).leaseRemainingMs>110000);assert.ok((await sB.readContent(jb)).snapshot.text);
 await denied(cB,'SELECT operations.read_bound_notification($1::jsonb)',[JSON.stringify(ja)]);
 for(const job of [qu,qi,qm])await denied(cA,'SELECT operations.read_bound_notification($1::jsonb)',[JSON.stringify({...job,leaseToken:id(90),attempt:1})]);
 assert.equal(await sA.claim(),null);assert.equal(await sB.claim(),null);
 emit({test:'concurrent scoped claims and authorized content; cross-team, NULL-team, inactive-team and mismatched snapshot scope denied',result:'PASS'});
 phase='inactive';await observer.query('UPDATE operations.notification_workers SET active=false WHERE id=$1',[workerA]);
 await denied(cA,'SELECT operations.claim_bound_notification()');await denied(cA,'SELECT operations.read_bound_notification($1::jsonb)',[JSON.stringify(ja)]);
 await observer.query('UPDATE operations.notification_workers SET active=true WHERE id=$1',[workerA]);
 await observer.query('UPDATE operations.teams SET active=false WHERE id=$1',[teamA]);await denied(cA,'SELECT operations.read_bound_notification($1::jsonb)',[JSON.stringify(ja)]);await observer.query('UPDATE operations.teams SET active=true WHERE id=$1',[teamA]);
 emit({test:'committed worker/team deactivation denies subsequent privileged operation',result:'PASS'});
 phase='fencing';await observer.query("UPDATE operations.notification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[ja.id]);
 const next=await sA.claim();assert.equal(next.id,ja.id);assert.notEqual(next.leaseToken,ja.leaseToken);
 for(const text of ['SELECT operations.read_bound_notification($1::jsonb)','SELECT operations.finish_bound_notification($1::jsonb,\'retry\',\'unavailable\')','SELECT operations.finish_bound_notification($1::jsonb,\'accept\',\'fake-stale\')'])await denied(cA,text,[JSON.stringify(ja)],'P0001');
 const record=await marker(sA,next);await sA.recordAttempt(next,record);
 await sA.recordObservation(next,{...record,status:'accepted',messageId:'fake-first'});await sA.accept(next,'fake-first');await sA.accept(next,'fake-first');
 await assert.rejects(sA.accept(next,'fake-different'));assert.equal((await sA.status(next)).state,'accepted');
 assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_actions WHERE outbox_id=$1',[next.id])).rows[0].n,1);
 await denied(cA,"SELECT operations.finish_bound_notification($1::jsonb,'accept','fake-first')",[JSON.stringify({...next,actorId:manager})],'P0001');
 emit({test:'stale token denied; duplicate marker/accept acknowledged idempotently; conflicting receipt rejected',result:'PASS'});
 phase='hold';await marker(sB,jb);await sB.quarantine(jb,'provider-unknown');await sB.quarantine(jb,'provider-unknown');assert.equal(await sB.claim(),null);assert.equal((await sB.status(jb)).held,true);
 emit({test:'durable quarantine excludes claim; worker cannot release',result:'PASS'});
 phase='manager';
 await observer.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[manager,member,owner]);
 await observer.query("INSERT INTO operations.employees(id,display_name,role,state) VALUES($1,'Synthetic Manager','manager','active'),($2,'Synthetic Member','member','active'),($3,'Synthetic Owner','owner','active')",[manager,member,owner]);
 await observer.query('INSERT INTO operations.team_memberships VALUES($1,$2),($1,$3),($1,$4)',[teamB,manager,member,owner]);
 const release=id(30);await observer.query('SET ROLE authenticated');
 for(const actor of [member,owner]){await observer.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);await denied(observer,'SELECT operations.release_notification_hold($1,$2)',[jb.id,release]);}
 await observer.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[manager]);
 await denied(observer,'SELECT operations.release_notification_hold($1,$2)',[next.id,release]);
 await observer.query('SELECT operations.release_notification_hold($1,$2)',[jb.id,release]);await observer.query('SELECT operations.release_notification_hold($1,$2)',[jb.id,release]);await observer.query('RESET ROLE');
 assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_release_events WHERE request_id=$1 AND actor_id=$2',[release,manager])).rows[0].n,1);
 assert.equal((await sB.status(jb)).held,false);
 emit({test:'active existing manager same-team release audited/idempotent; member, owner and cross-team denied (local Auth shim)',result:'PASS'});
 // Remove B from further claim tests by accepted reconciliation under a new lease.
 const bj=await sB.claim();await marker(sB,bj);await sB.recordObservation(bj,{key:`synthetic:${bj.id}`,digest:(await sB.readContent(bj)).digest,status:'accepted',messageId:'fake-b'});await sB.accept(bj,'fake-b');
 phase='inactive-manager';const qheld=await enqueue(32,teamB),jheld=await sB.claim();assert.equal(jheld.id,qheld.id);await marker(sB,jheld);await sB.quarantine(jheld,'provider-unknown');
 await observer.query("UPDATE operations.employees SET state='suspended' WHERE id=$1",[manager]);await observer.query('SET ROLE authenticated');await observer.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[manager]);await denied(observer,'SELECT operations.release_notification_hold($1,$2)',[jheld.id,id(33)]);await observer.query('RESET ROLE');
 await observer.query("UPDATE operations.employees SET state='active' WHERE id=$1",[manager]);
 emit({test:'suspended manager cannot release even with existing Auth claim; hold retained',result:'PASS'});
 phase='same-job-contention';const qc=await enqueue(34,teamA);await cA.query('BEGIN');const locked=(await cA.query('SELECT operations.claim_bound_notification() job')).rows[0].job;assert.equal(locked.id,qc.id);
 assert.equal(await sA.claim(),null);assert.equal((await observer.query('SELECT attempts FROM operations.notification_outbox WHERE id=$1',[qc.id])).rows[0].attempts,0);await cA.query('ROLLBACK');
 const reclaimed=await sA.claim();assert.equal(reclaimed.id,qc.id);assert.equal(reclaimed.attempt,1);const rr=await marker(sA,reclaimed);
 await sA.recordObservation(reclaimed,{...rr,status:'accepted',messageId:'fake-contention'});await sA.recordObservation(reclaimed,{...rr,status:'retryable'});await assert.rejects(sA.retry(reclaimed,'unavailable'));await sA.accept(reclaimed,'fake-contention');
 emit({test:'same-job SKIP LOCKED contention and rolled-back claim; prior receipt forbids retry despite retryable observation',result:'PASS'});
 phase='engine';const qengine=await enqueue(40,teamA);const provider=createFakeProvider({behavior:'lost-ack'});
 const w=createNotificationWorker({store:sA,provider,namespace:'synthetic'});workers.push(w);
 assert.equal((await w.runOnce()).status,'unknown');assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_attempts WHERE outbox_id=$1',[qengine.id])).rows[0].n,1);
 // Simulated process restart, real persisted attempt/lease; external provider fake
 // retains acceptance in memory. Expiry advanced by operator fixture, not wall wait.
 await w.shutdown();await observer.query("UPDATE operations.notification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[qengine.id]);
 dA=driver();sA=createPostgresNotificationStore(dA);const recovered=createNotificationWorker({store:sA,provider,namespace:'synthetic'});workers.push(recovered);
 assert.equal((await recovered.runOnce()).status,'accepted');assert.equal(provider.calls(),1);
 emit({test:'real worker/store persistence survives instance restart and fake-provider lost acknowledgement without resending',result:'PASS',provider:'FAKE'});
 phase='commit';const qcommit=await enqueue(41,teamA),jc=await sA.claim(),rc=await marker(sA,jc);assert.equal(jc.id,qcommit.id);
 await sA.recordObservation(jc,{...rc,status:'accepted',messageId:'fake-commit'});
 const proxy=await createCommitFaultProxy({mode:'after-server-commit',port:15433,emit:e=>emit({fault:'accept-commit',...e})});proxies.push(proxy);
 const ackDriver=driver('synthetic_notification',secrets.notification,15433,proxy.ca),ackStore=createPostgresNotificationStore(ackDriver);
 const acceptance=ackStore.accept(jc,'fake-commit').then(()=>({ok:true}),e=>({ok:false,outcome:e.outcome}));pending.push(acceptance);await bounded(proxy.phase);
 assert.equal((await observer.query('SELECT state FROM operations.notification_outbox WHERE id=$1',[jc.id])).rows[0].state,'accepted');proxy.disconnect();assert.deepEqual(await bounded(acceptance),{ok:false,outcome:'unknown'});
 await sA.accept(jc,'fake-commit');assert.equal((await observer.query("SELECT count(*)::int n FROM operations.notification_actions WHERE outbox_id=$1 AND action='accept'",[jc.id])).rows[0].n,1);await proxy.close();
 emit({test:'genuine accepted COMMIT acknowledgement loss; independent committed-state proof and idempotent same-lease action recovery',result:'PASS'});
 phase='stored-receipt';const qs=await enqueue(43,teamA),js=await sA.claim(),rs=await marker(sA,js);assert.equal(js.id,qs.id);
 await sA.recordObservation(js,{...rs,status:'accepted',messageId:'fake-stored'});await observer.query("UPDATE operations.notification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[js.id]);
 const noLookup=createFakeProvider();const noLookupWorker=createNotificationWorker({store:sA,provider:{...noLookup,lookup:async()=>{throw new Error('lookup must not be called');}},namespace:'synthetic'});workers.push(noLookupWorker);
 assert.equal((await noLookupWorker.runOnce()).status,'accepted');assert.equal(noLookup.calls(),0);
 emit({test:'new lease reconciles stored acceptance without provider lookup/send',result:'PASS'});
 phase='exhaustion';const qe=await enqueue(42,teamA);await observer.query('UPDATE operations.notification_outbox SET attempts=9 WHERE id=$1',[qe.id]);const je=await sA.claim();assert.equal(je.attempt,10);await marker(sA,je);await observer.query("UPDATE operations.notification_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[je.id]);assert.equal(await sA.claim(),null);
 const status=await sA.status(je);assert.equal(status.state,'failed');assert.equal(status.held,true);assert.equal(status.attempt,10);
 emit({test:'expired tenth attempt becomes held/exhausted, never an eleventh send',result:'PASS'});
 phase='definite-retry';const qr=await enqueue(44,teamA),rejectProvider=createFakeProvider({behavior:'reject'}),rejectWorker=createNotificationWorker({store:sA,provider:rejectProvider,namespace:'synthetic'});workers.push(rejectWorker);
 assert.equal((await rejectWorker.runOnce()).status,'retry-scheduled');const retry=(await observer.query('SELECT state,attempts,next_attempt_at>clock_timestamp() delayed FROM operations.notification_outbox WHERE id=$1',[qr.id])).rows[0];assert.equal(retry.state,'queued');assert.equal(retry.attempts,1);assert.equal(retry.delayed,true);assert.equal(await sA.claim(),null);
 emit({test:'real worker commits fake rejection observation and fenced five-minute retry without attempt reset',result:'PASS',provider:'FAKE'});
 phase='unknown';const qunknown=await enqueue(45,teamA),unknownProvider=createFakeProvider({behavior:'unknown'}),unknownWorker=createNotificationWorker({store:sA,provider:unknownProvider,namespace:'synthetic'});workers.push(unknownWorker);
 assert.equal((await unknownWorker.runOnce()).status,'held');assert.equal(await sA.claim(),null);
 assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_holds WHERE outbox_id=$1',[qunknown.id])).rows[0].n,1);
 emit({test:'real worker persists fake unknown observation/hold atomically and excludes further claim',result:'PASS',provider:'FAKE'});
}catch(e){failed=true;emit({result:'FAIL',phase,code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'HARNESS_OR_ASSERTION',outcome:e.outcome??null});}
finally{
 for(const [name,operation] of [['proxies',()=>Promise.all(proxies.map(p=>p.close()))],['workers',()=>Promise.all(workers.map(w=>w.shutdown()))],['drivers',()=>Promise.all(drivers.map(d=>d.shutdown()))],['pending',()=>Promise.allSettled(pending)],['clients',()=>Promise.all(clients.map(c=>c.end()))]]){
  try{await bounded(operation(),8000);}catch{failed=true;emit({result:'FAIL',cleanupPhase:name,reason:'CLEANUP_UNCONFIRMED'});}
 }
}
process.exitCode=failed?1:0;
