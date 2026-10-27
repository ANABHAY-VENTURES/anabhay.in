// Real PostgreSQL storage/constraint tests using operator fixtures. NOT worker/RLS
// positive authorization or real provider evidence. Loopback TLS only.
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCommitFaultProxy} from './commit-fault-proxy.mjs';
const [run]=process.argv.slice(2);if(!/^[a-f0-9-]{36}$/.test(run??''))throw new Error('INVALID_LOCAL_RUN');
const secrets=JSON.parse(fs.readFileSync('/tmp/review-credentials.json'));
const base={host:'127.0.0.1',port:5432,database:'postgres',ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/tmp/review-ca.crt')},connectionTimeoutMillis:1000,statement_timeout:1500,lock_timeout:1000};
const clients=[],proxies=[],pending=[];let failed=false,step='connect';
const emit=v=>console.log(JSON.stringify({stage:'persistence',...v}));
async function client(label,role='synthetic_observer',port=5432,ca=base.ssl.ca){
 const c=new pg.Client({...base,port,ssl:{rejectUnauthorized:true,ca},user:role,password:role==='synthetic_observer'?secrets.observer:secrets.notification,application_name:`campaign-${run}-${label}`});c.on('error',()=>{});clients.push(c);await c.connect();emit({role:label,backendPid:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid});return c;
}
async function bounded(p,ms=4000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DEADLINE')),ms);})]);}finally{clearTimeout(timer);}}
async function denied(c,text,args,code){await assert.rejects(c.query(text,args),e=>e.code===code);}
const payload={schemaVersion:1,fullName:'Synthetic Fixture',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic metadata enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
const canonical=JSON.stringify({destination:'qa@example.invalid',templateVersion:'synthetic-v1',text:'synthetic notification 🌱'});
const digest=createHash('sha256').update(canonical).digest('hex');
const key=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const snapshotSQL='INSERT INTO operations.notification_snapshots(outbox_id,namespace,canonical_payload) VALUES($1,$2,$3)';
let observer;
try{
 observer=await client('metadata-observer');step='catalogs';
 assert.deepEqual((await observer.query('SELECT version FROM operations.migration_versions ORDER BY version')).rows.map(r=>r.version),[1,2,3,4,5]);
 emit({postgresVersion:(await observer.query('SHOW server_version')).rows[0].server_version,
  digestFunctions:(await observer.query("SELECT proname,provolatile FROM pg_proc WHERE pronamespace='pg_catalog'::regnamespace AND proname IN ('convert_to','sha256','uuid_out') ORDER BY proname")).rows});
 const names=['notification_snapshots','notification_attempts','notification_observations','notification_holds'];
 const roles=(await observer.query("SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname NOT IN ('postgres') ORDER BY rolname")).rows;
 for(const name of names){
  const table=`operations.${name}`;const r=(await observer.query('SELECT relrowsecurity r,relforcerowsecurity f FROM pg_class WHERE oid=$1::regclass',[table])).rows[0];assert.ok(r.r&&r.f);
  for(const {rolname} of roles){
   const access=(await observer.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') access",[rolname,table])).rows[0].access;
   if(['pg_read_all_data','pg_write_all_data'].includes(rolname)){
    emit({platformRole:rolname,object:name,hasPlatformAccess:access,trustBoundary:'predefined administrative capability, not an application identity'});
   }else{if(access)emit({unexpectedRole:rolname,object:name});assert.equal(access,false);}
  }
 }
 assert.equal((await observer.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='operations' AND tablename=ANY($1)",[names])).rows[0].n,0);
 for(const {rolname} of roles.filter(r=>!r.rolname.startsWith('pg_')))for(const privileged of ['pg_read_all_data','pg_write_all_data'])assert.equal((await observer.query("SELECT pg_has_role($1,$2,'MEMBER') access",[rolname,privileged])).rows[0].access,false);
 for(const {rolname} of roles)for(const signature of ['operations.valid_notification_snapshot(text)','operations.derive_notification_snapshot()','operations.notification_append_only()'])assert.equal((await observer.query("SELECT has_function_privilege($1,$2,'EXECUTE') access",[rolname,signature])).rows[0].access,false);
 emit({test:'FORCE RLS, no permissive policies, ordinary-role table/column denial; no app membership in administrative data roles',result:'PASS'});
 step='fixtures';const jobs=[];
 for(let n=1;n<=5;n++){
  const receipt=(await observer.query('SELECT operations.ingest_enquiry($1,$2,$3::jsonb) receipt',[key(n),'a'.repeat(64),JSON.stringify(payload)])).rows[0].receipt;
  jobs.push((await observer.query('SELECT id FROM operations.notification_outbox WHERE enquiry_id=$1',[receipt.enquiryId])).rows[0].id);
 }
 step='snapshot';await observer.query(snapshotSQL,[jobs[0],'synthetic',canonical]);
 const saved=(await observer.query('SELECT snapshot_digest,provider_key,team_id FROM operations.notification_snapshots WHERE outbox_id=$1',[jobs[0]])).rows[0];
 assert.equal(saved.snapshot_digest,digest);assert.equal(saved.provider_key,`synthetic:${jobs[0]}`);assert.equal(saved.team_id,null);
 for(const action of ['UPDATE operations.notification_snapshots SET namespace=namespace WHERE outbox_id=$1','DELETE FROM operations.notification_snapshots WHERE outbox_id=$1'])await denied(observer,action,[jobs[0]],'55000');
 await denied(observer,snapshotSQL,[jobs[0],'synthetic',canonical],'23505');
 await denied(observer,'INSERT INTO operations.notification_snapshots(outbox_id,namespace,canonical_payload,snapshot_digest) VALUES($1,$2,$3,$4)',[jobs[1],'synthetic',canonical,'a'.repeat(64)],'22023');
 await denied(observer,'INSERT INTO operations.notification_snapshots(outbox_id,namespace,canonical_payload,provider_key) VALUES($1,$2,$3,$4)',[jobs[1],'synthetic',canonical,'forged-key'],'22023');
 emit({test:'immutable snapshot, Node/PostgreSQL UTF-8 digest equality, one stable provider key; NULL team remains unclassified',result:'PASS'});
 step='validation';
 for(const value of ['null','[]','{',JSON.stringify({destination:'bad',templateVersion:'v1',text:'synthetic'}),JSON.stringify({destination:'qa@example.invalid',templateVersion:'v1',text:''}),JSON.stringify({destination:'qa@example.invalid',templateVersion:'v1',text:'x'.repeat(16385)}),JSON.stringify({destination:'qa@example.invalid',templateVersion:'v1',text:'synthetic',extra:'forbidden'})])await denied(observer,snapshotSQL,[jobs[1],'synthetic',value],'23514');
 await denied(observer,snapshotSQL,[jobs[1],'UPPERCASE',canonical],'23514');
 emit({test:'snapshot shape/type/destination/template/text byte bounds and namespace constraints',result:'PASS'});
 step='records';const attemptSQL='INSERT INTO operations.notification_attempts(outbox_id,attempt,lease_fingerprint,snapshot_digest) VALUES($1,$2,$3,$4)';
 await observer.query(attemptSQL,[jobs[0],1,'b'.repeat(64),digest]);
 await denied(observer,attemptSQL,[jobs[0],1,'c'.repeat(64),digest],'23505');
 await denied(observer,attemptSQL,[jobs[0],11,'c'.repeat(64),digest],'23514');
 await denied(observer,attemptSQL,[jobs[0],2,'c'.repeat(64),'d'.repeat(64)],'23503');
 await denied(observer,attemptSQL,[jobs[0],2,'invalid',digest],'23514');
 const observationSQL='INSERT INTO operations.notification_observations(outbox_id,attempt,provider_state,provider_message_id) VALUES($1,$2,$3,$4)';
 for(const state of ['accepted','delivered','pending','failed','unknown','absent','rejected','rate-limited','retryable'])await observer.query(observationSQL,[jobs[0],1,state,['accepted','delivered','pending','failed'].includes(state)?'synthetic-receipt':null]);
 await denied(observer,observationSQL,[jobs[0],1,'accepted',null],'23514');
 await denied(observer,observationSQL,[jobs[0],1,'unknown','synthetic-receipt'],'23514');
 await denied(observer,observationSQL,[jobs[0],2,'unknown',null],'23503');
 await denied(observer,observationSQL,[jobs[0],1,'unknown',null],'23505');
 for(const name of ['notification_attempts','notification_observations'])await denied(observer,`DELETE FROM operations.${name} WHERE outbox_id=$1`,[jobs[0]],'55000');
 emit({test:'attempt uniqueness/bounds/digest FK, outcome receipts/FK/duplicates, immutable operational records',result:'PASS'});
 step='holds';await observer.query("INSERT INTO operations.notification_holds(outbox_id,reason) VALUES($1,'provider-unknown')",[jobs[0]]);
 await denied(observer,"INSERT INTO operations.notification_holds(outbox_id,reason) VALUES($1,'provider-unknown')",[jobs[0]],'23505');
 await denied(observer,"INSERT INTO operations.notification_holds(outbox_id,reason) VALUES($1,'invalid')",[jobs[1]],'23514');
 emit({test:'quarantine metadata uniqueness and reason constraints only; claim exclusion remains UNIMPLEMENTED',result:'PASS'});
 step='denials';const notification=await client('unauthorized-worker','synthetic_notification');
 for(const name of names){await denied(notification,`SELECT * FROM operations.${name}`,[],'42501');await denied(notification,`DELETE FROM operations.${name}`,[],'42501');}
 for(const role of ['anon','authenticated','service_role','ops_ingestion_api']){
  await observer.query(`SET ROLE ${role}`);
  for(const name of names)await denied(observer,`SELECT * FROM operations.${name}`,[],'42501');
  await denied(observer,'SELECT operations.valid_notification_snapshot($1)',[canonical],'42501');await observer.query('RESET ROLE');
 }
 emit({test:'actual worker LOGIN/client/capability read/write/function denials; no positive team authorization claimed',result:'PASS'});
 step='rollback';await observer.query('BEGIN');await observer.query(snapshotSQL,[jobs[1],'synthetic',canonical]);await observer.query('ROLLBACK');
 assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_snapshots WHERE outbox_id=$1',[jobs[1]])).rows[0].n,0);
 await observer.query('BEGIN');await denied(observer,snapshotSQL,[jobs[1],'invalid!',canonical],'23514');await observer.query('ROLLBACK');
 emit({test:'explicit rollback and failed transaction leave no snapshot',result:'PASS'});
 // Operator-fixture lost COMMIT acknowledgement; not a worker adapter test.
 for(const [index,mode,port] of [[2,'before-server-commit',15432],[3,'after-server-commit',15433]]){
  step=mode;const proxy=await createCommitFaultProxy({mode,port,emit:e=>emit({fault:mode,...e})});proxies.push(proxy);
  const c=await client(`metadata-${index}`,'synthetic_observer',port,proxy.ca);await c.query('BEGIN');await c.query(snapshotSQL,[jobs[index],'synthetic',canonical]);
  const commit=c.query('COMMIT').then(()=>({ok:true}),()=>({ok:false}));pending.push(commit);await bounded(proxy.phase);
  const visible=(await observer.query('SELECT count(*)::int n FROM operations.notification_snapshots WHERE outbox_id=$1',[jobs[index]])).rows[0].n;
  assert.equal(visible,mode==='after-server-commit'?1:0);proxy.disconnect();assert.equal((await bounded(commit)).ok,false);await c.end();await proxy.close();
  if(mode==='after-server-commit'){
   // Same-identity metadata recovery, no new outbox/key or automatic resend.
   await observer.query(snapshotSQL+' ON CONFLICT(outbox_id) DO NOTHING',[jobs[index],'synthetic',canonical]);
   assert.equal((await observer.query('SELECT count(*)::int n FROM operations.notification_snapshots WHERE outbox_id=$1',[jobs[index]])).rows[0].n,1);
  }
  emit({test:`real metadata ${mode} transport loss with independent committed-state observation`,result:'PASS'});
 }
 emit({test:'scoped worker claim/content/ack/retry/reconciliation adapter',result:'BLOCKED',reason:'Worker identity and routing policies unresolved; metadata storage is not a capability implementation'});
}catch(e){failed=true;emit({result:'FAIL',phase:step,code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'ASSERTION_OR_HARNESS'});}
finally{
 for(const operation of [()=>Promise.all(proxies.map(p=>p.close())),()=>Promise.allSettled(pending),()=>Promise.all(clients.map(c=>c.end()))]){
  try{await bounded(operation(),5000);}catch{failed=true;emit({result:'FAIL',reason:'CLEANUP_UNCONFIRMED'});}
 }
}
process.exitCode=failed?1:0;
