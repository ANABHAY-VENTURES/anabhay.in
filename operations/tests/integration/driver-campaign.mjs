import pg from 'pg';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {createPostgresDriver,createIngestionDriver,createNotificationDriver} from '../../server/postgres.mjs';
import {validateRequest} from '../../server/enquiry.mjs';
import {createCommitFaultProxy} from './commit-fault-proxy.mjs';

const [stage,run]=process.argv.slice(2);
if(!['tls','lifecycle','success','pool','timeouts','commit','recovery','shutdown'].includes(stage)||!/^[a-f0-9-]{36}$/.test(run??''))throw new Error('INVALID_CAMPAIGN_STAGE');
const started=performance.now();
const emit=data=>console.log(JSON.stringify({stage,elapsedMs:Math.round(performance.now()-started),...data}));
// Observe fatal events without intercepting Node's default process termination.
process.on('uncaughtExceptionMonitor',error=>emit({result:'FAIL',failure:'UNCAUGHT_EXCEPTION',
  errorName:/^[A-Za-z]+$/.test(error.name??'')?error.name:'Error',
  code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:null,
  classification:error.message==='Connection terminated unexpectedly'?'PG_CONNECTION_TERMINATED':'UNCLASSIFIED_FATAL'}));
const secrets=JSON.parse(fs.readFileSync('/tmp/review-credentials.json'));const ca=fs.readFileSync('/tmp/review-ca.crt');
const base={host:'127.0.0.1',expectedHost:'127.0.0.1',port:5432,database:'postgres',ssl:{rejectUnauthorized:true,ca},max:1};
const clients=[],drivers=[],proxies=[],pending=[];let failed=false;
const shutdowns=new Map();
const expectedUnconfirmed=new Set(),verifiedTerminated=new Set();
function shutdown(driver){if(!shutdowns.has(driver))shutdowns.set(driver,driver.shutdown());return shutdowns.get(driver);}
const config={ingestion:{...base,user:'synthetic_ingestion',password:secrets.ingestion},notification:{...base,user:'synthetic_notification',password:secrets.notification}};
const create=options=>{const d=createPostgresDriver({...config,...options});drivers.push(d);return d;};
async function client(label){const c=new pg.Client({...base,user:'synthetic_observer',password:secrets.observer,application_name:`campaign-${run}-${label}`,connectionTimeoutMillis:1000,statement_timeout:1000});c.on('error',()=>{});clients.push(c);await c.connect();emit({role:label,backendPid:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid});return c;}
const observed=promise=>{const p=promise.then(value=>({ok:true,value}),error=>({ok:false,error}));pending.push(p);return p;};
async function bounded(promise,ms=3000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('CAMPAIGN_DEADLINE')),ms);})]);}finally{clearTimeout(timer);}}
async function until(check,ms=2000){const deadline=performance.now()+ms;do{if(await check())return;await delay(15);}while(performance.now()<deadline);throw new Error('BARRIER_NOT_OBSERVED');}
const payload={schemaVersion:1,fullName:'Synthetic QA',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic test enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
const request=n=>validateRequest(JSON.stringify(payload),`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
async function counts(c,key){return (await c.query('SELECT count(DISTINCT e.id)::int enquiries,count(DISTINCT e.lead_id)::int leads,count(DISTINCT o.id)::int outbox,min(e.id::text) receipt FROM operations.website_enquiries e LEFT JOIN operations.notification_outbox o ON o.enquiry_id=e.id WHERE e.idempotency_key=$1',[key])).rows[0];}
async function lock(c,key){await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);}
async function waiter(observer,holder){let row;await until(async()=>{row=(await observer.query("SELECT pid FROM pg_stat_activity WHERE usename='synthetic_ingestion' AND $1::integer=ANY(pg_blocking_pids(pid))",[holder])).rows[0];return Boolean(row);});emit({phase:'DRIVER_WAITER_IDENTIFIED',backendPid:row.pid,holderPid:holder});return row.pid;}
async function backendAbsent(observer,pid){await until(async()=>!(await observer.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[pid])).rowCount);}
async function tlsCheck({servername='localhost',authority=ca,expired=false}={}){
 return bounded(new Promise((resolve,reject)=>{const raw=net.connect({host:'127.0.0.1',port:expired?5444:5432});
 raw.once('error',reject);const upgrade=()=>{const secured=tls.connect({socket:raw,servername,ca:authority,rejectUnauthorized:true});secured.once('secureConnect',()=>{secured.destroy();resolve({authorized:secured.authorized});});secured.once('error',error=>{raw.destroy();resolve({code:error.code});});};
 raw.once('connect',()=>{if(expired)return upgrade();const bytes=Buffer.alloc(8);bytes.writeInt32BE(8);bytes.writeInt32BE(80877103,4);raw.write(bytes);raw.once('data',response=>{if(response.toString()==='S')upgrade();else{raw.destroy();reject(new Error('TLS_UNAVAILABLE'));}});});}),3000);
}
let observer;
try {
 if(stage==='tls'){
  assert.equal((await tlsCheck()).authorized,true);emit({test:'trusted TLS',result:'PASS'});
  assert.equal((await tlsCheck({servername:'wrong.example.invalid'})).code,'ERR_TLS_CERT_ALTNAME_INVALID');emit({test:'wrong hostname',result:'PASS'});
  assert.ok(['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes((await tlsCheck({authority:fs.readFileSync('/tmp/review-wrong-ca.crt')})).code));emit({test:'untrusted CA',result:'PASS'});
  assert.equal((await tlsCheck({expired:true})).code,'CERT_HAS_EXPIRED');emit({test:'expired certificate',result:'PASS'});
 }else {
  observer=await client('observer');
  if(stage==='lifecycle'){
   for(const phase of ['checkout','recheckout']){
    const physical=[],pools=[];
    class InstrumentedPool extends pg.Pool{
     constructor(options){super(options);pools.push(this);this.on('connect',c=>physical.push(c));this.on('acquire',c=>{
      c.reviewAcquires=(c.reviewAcquires??0)+1;
      if(!this.reviewInjected&&c.reviewAcquires===(phase==='checkout'?1:2)){
       this.reviewInjected=true;queueMicrotask(()=>c.connection.stream.destroy());
      }
     });}
    }
    const d=createPostgresDriver({...config},{Pool:InstrumentedPool});drivers.push(d);
    if(phase==='recheckout'){
     assert.equal(await d.consumeLimit('b'.repeat(64)),true,'LIFECYCLE_FIRST_SUCCESS');
     assert.equal(physical[0].listeners('error').filter(f=>f.name==='connectionError').length,1,'LIFECYCLE_SINGLE_LISTENER');
    }
    const result=await observed(d.consumeLimit('b'.repeat(64)));
    assert.equal(result.error?.outcome,'not-committed','LIFECYCLE_FAILURE_OUTCOME');
    await until(async()=>physical[0].listeners('error').filter(f=>f.name==='connectionError').length===0);
    assert.equal(physical.length,1,'LIFECYCLE_PHYSICAL_COUNT');assert.equal(physical[0].reviewAcquires,phase==='checkout'?1:2,'LIFECYCLE_ACQUIRE_COUNT');
    assert.equal(await d.consumeLimit('b'.repeat(64)),true,'LIFECYCLE_REPLACEMENT_SUCCESS');assert.equal(physical.length,2,'LIFECYCLE_REPLACEMENT_COUNT');
    await shutdown(d);assert.equal(d.shutdown(),shutdown(d),'LIFECYCLE_SHUTDOWN_PROMISE');
    await until(async()=>physical.every(c=>c.listeners('error').filter(f=>f.name==='connectionError').length===0));
    emit({test:`real TLS socket destruction at ${phase}; broken client replaced; listener removed at end`,result:'PASS'});
   }
  }
  if(stage==='success'){
   const isolatedIngest=createIngestionDriver(config.ingestion);drivers.push(isolatedIngest);
   assert.equal(isolatedIngest.claimNotification,undefined);
   const isolatedReceipt=await isolatedIngest.ingestEnquiry(request(13));
   assert.equal((await counts(observer,request(13).key)).receipt,isolatedReceipt.enquiryId);
   assert.equal(await isolatedIngest.consumeLimit('e'.repeat(64)),true);
   const isolatedNotification=createNotificationDriver(config.notification);drivers.push(isolatedNotification);
   assert.equal(isolatedNotification.ingestEnquiry,undefined);
   const isolatedJob=await isolatedNotification.claimNotification();assert.ok(isolatedJob?.id);
   await isolatedNotification.retryNotification(isolatedJob.id,isolatedJob.leaseToken,'unavailable');
   await shutdown(isolatedIngest);await shutdown(isolatedNotification);
   emit({test:'single-capability process factories commit ingestion/rate and fenced notification claim/retry',result:'PASS'});
   const d=create({});const receipt=await d.ingestEnquiry(request(1));assert.equal(receipt.persisted,true);
   assert.deepEqual(await counts(observer,request(1).key),{enquiries:1,leads:1,outbox:1,receipt:receipt.enquiryId});emit({test:'committed ingestion independently visible',result:'PASS'});
   await observer.query("CREATE FUNCTION operations.campaign_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic campaign failure'; END $$");
   await observer.query('CREATE TRIGGER campaign_failure BEFORE INSERT ON operations.notification_outbox FOR EACH ROW EXECUTE FUNCTION operations.campaign_failure()');
   try{
    assert.equal(await d.consumeLimit('d'.repeat(64)),true);const rate=(await observer.query('SELECT used FROM operations.rate_buckets WHERE slot=0')).rows[0].used;
    const outcome=await observed(d.ingestEnquiry(request(2)));assert.equal(outcome.error?.outcome,'not-committed');
    assert.deepEqual(await counts(observer,request(2).key),{enquiries:0,leads:0,outbox:0,receipt:null});assert.equal((await observer.query('SELECT used FROM operations.rate_buckets WHERE slot=0')).rows[0].used,rate);
    await until(async()=>!(await observer.query("SELECT 1 FROM pg_stat_activity WHERE usename='synthetic_ingestion'")).rowCount);
    emit({test:'third-insert rollback, durable rate accounting, disposal',result:'PASS'});
   }finally{await observer.query('DROP TRIGGER campaign_failure ON operations.notification_outbox');await observer.query('DROP FUNCTION operations.campaign_failure()');}
  }
  if(stage==='pool'){
   const holder=await client('holder');const pid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;await lock(holder,request(3).key);
   const d=create({acquisitionMs:200,lockMs:2000,statementMs:3000,operationMs:4500});
   try{
    const first=observed(d.ingestEnquiry(request(3)));await waiter(observer,pid);
    const t=performance.now();const second=observed(d.ingestEnquiry(request(4)));const excess=await observed(d.ingestEnquiry(request(5)));
    assert.equal(excess.error?.outcome,'not-committed');assert.equal((await bounded(second,1000)).error?.outcome,'not-committed');assert.ok(performance.now()-t<1000);
    assert.equal((await observer.query("SELECT count(*)::int n FROM pg_stat_activity WHERE usename='synthetic_ingestion'")).rows[0].n,1);
    emit({test:'pool saturation',active:1,acquisitionRejected:1,admissionRejected:1,result:'PASS'});
    await holder.query('ROLLBACK');assert.equal((await bounded(first)).value.persisted,true);assert.equal((await d.ingestEnquiry(request(6))).persisted,true);emit({test:'pool recovers after release',result:'PASS'});
   }finally{await holder.query('ROLLBACK');}
  }
  if(stage==='timeouts'){
   const holder=await client('holder');const pid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const d=create({lockMs:1000,statementMs:2000,operationMs:3500});await lock(holder,request(7).key);
   try{
    const operation=observed(d.ingestEnquiry(request(7)));const blocked=await waiter(observer,pid);const result=await bounded(operation,2500);assert.equal(result.error?.outcome,'not-committed');await backendAbsent(observer,blocked);assert.equal((await counts(observer,request(7).key)).enquiries,0);emit({test:'lock timeout and failed-backend disposal',result:'PASS'});
   }finally{await holder.query('ROLLBACK');}
   await observer.query("CREATE FUNCTION operations.campaign_sleep() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(5); RETURN NEW; END $$");await observer.query('CREATE TRIGGER campaign_sleep BEFORE INSERT ON operations.notification_outbox FOR EACH ROW EXECUTE FUNCTION operations.campaign_sleep()');
   try{
    const slow=create({statementMs:500,lockMs:200,operationMs:2000});const operation=observed(slow.ingestEnquiry(request(8)));let pid;
    await until(async()=>{pid=(await observer.query("SELECT pid FROM pg_stat_activity WHERE usename='synthetic_ingestion' AND wait_event='PgSleep'")).rows[0]?.pid;return Boolean(pid);});emit({phase:'SERVER_SLEEP_OBSERVED',backendPid:pid});
    assert.equal((await bounded(operation,2000)).error?.outcome,'not-committed');await backendAbsent(observer,pid);assert.equal((await counts(observer,request(8).key)).enquiries,0);emit({test:'server statement timeout, rollback and backend exit',result:'PASS'});
   }finally{await observer.query('DROP TRIGGER campaign_sleep ON operations.notification_outbox');await observer.query('DROP FUNCTION operations.campaign_sleep()');}
  }
  if(stage==='commit'||stage==='shutdown'){
   const cases=stage==='commit'?[{mode:'before-server-commit',port:15432,n:9},{mode:'after-server-commit',port:15433,n:10}]:[{mode:'after-server-commit',port:15434,n:11}];
   for(const fault of cases){
    const proxy=await createCommitFaultProxy({...fault,emit:event=>emit({fault:fault.mode,...event})});proxies.push(proxy);
    const d=create({ingestion:{...config.ingestion,port:fault.port,ssl:{rejectUnauthorized:true,ca:proxy.ca}},operationMs:7000,shutdownMs:500});
    const pendingCommit=observed(d.ingestEnquiry(request(fault.n)));await bounded(proxy.phase,4000);
    if(fault.mode==='after-server-commit'){
      const durable=await counts(observer,request(fault.n).key);assert.deepEqual({enquiries:durable.enquiries,leads:durable.leads,outbox:durable.outbox},{enquiries:1,leads:1,outbox:1});emit({test:'independent committed-server evidence while ack withheld',result:'PASS'});
    }
    if(stage==='shutdown'){
      const t=performance.now();const shutting=shutdown(d);assert.equal(d.shutdown(),shutting);assert.equal((await observed(d.ingestEnquiry(request(12)))).error?.outcome,'not-committed');const closeResult=await bounded(observed(shutting),1500);assert.equal(closeResult.error?.outcome,'shutdown-unconfirmed');expectedUnconfirmed.add(d);assert.equal(d.shutdown(),shutting);assert.ok(performance.now()-t<1500);
    }else proxy.disconnect();
    const outcome=await bounded(pendingCommit,2000);assert.equal(outcome.error?.outcome,'unknown');proxy.disconnect();await proxy.close();
    await until(async()=>!(await observer.query("SELECT 1 FROM pg_stat_activity WHERE usename='synthetic_ingestion'")).rowCount);
    if(expectedUnconfirmed.has(d))verifiedTerminated.add(d);
    if(fault.mode==='before-server-commit')assert.equal((await counts(observer,request(fault.n).key)).enquiries,0);
    emit({test:stage==='shutdown'?'bounded uncertain shutdown; new work denied':'real transport fault classified unknown',fault:fault.mode,result:'PASS'});
   }
  }
  if(stage==='recovery'||stage==='shutdown'){
   const n=stage==='shutdown'?11:10;const d=create({ingestion:{...config.ingestion,max:2}});const original=await counts(observer,request(n).key);assert.equal(original.enquiries,1);
   const receipts=await Promise.all([d.reconcileEnquiry(request(n)),d.reconcileEnquiry(request(n))]);for(const receipt of receipts){assert.equal(receipt.enquiryId,original.receipt);assert.equal(receipt.replayed,true);}
   assert.deepEqual(await counts(observer,request(n).key),original);if(stage==='recovery')assert.equal((await counts(observer,request(9).key)).enquiries,0);emit({test:'same-key concurrent recovery, one receipt and outbox',result:'PASS'});
  }
 }
}catch(error){failed=true;emit({result:'FAIL',failure:error.code??(error.name==='AssertionError'?'ASSERTION_FAILED':'HARNESS_FAILURE'),assertion:/^LIFECYCLE_[A-Z_]+$/.test(error.message??'')?error.message:null,outcome:error.outcome??null});}
finally{
 // Do not repeat pool.end() on a driver already shut down by the test. Attempt
 // every cleanup phase even if an earlier phase fails; the controller still verifies.
 for(const [phase,operation,ms] of [
  ['proxy',()=>Promise.all(proxies.map(p=>p.close())),2000],
  ['driver',()=>Promise.all(drivers.map(d=>shutdown(d).catch(error=>{if(!expectedUnconfirmed.has(d)||!verifiedTerminated.has(d)||error.outcome!=='shutdown-unconfirmed')throw error;}))),8000],
  ['pending',()=>Promise.allSettled(pending),2000],
  ['clients',()=>Promise.all(clients.map(c=>c.end())),2000]]){
  try{await bounded(operation(),ms);}catch{failed=true;emit({result:'FAIL',failure:'CLEANUP_UNCONFIRMED',cleanupPhase:phase});}
 }
}
process.exitCode=failed?1:0;
