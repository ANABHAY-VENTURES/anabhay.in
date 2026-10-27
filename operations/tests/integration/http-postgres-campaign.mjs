// Real HTTP + production ingestion factory + real PostgreSQL, isolated controller only.
import pg from 'pg';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {startLocalPostgresEnquiry} from '../../server/local-postgres-http.mjs';
import {developmentOrigin} from '../../server/local-http.mjs';
import {createCommitFaultProxy} from './commit-fault-proxy.mjs';
const [run]=process.argv.slice(2);if(!/^[a-f0-9-]{36}$/.test(run??''))throw Error('INVALID_LOCAL_RUN');
const credentials=JSON.parse(readFileSync('/tmp/review-credentials.json'));
const ca=readFileSync('/tmp/review-ca.crt','utf8');
const secret='synthetic-http-rate-identity-secret-32';
const target={expectedProjectRef:'aaaaaaaaaaaaaaaaaaaa',expectedDatabaseHost:'127.0.0.1',allowedOrigins:[developmentOrigin],ca};
const config=port=>({OPERATIONS_PROJECT_REF:target.expectedProjectRef,OPERATIONS_INGESTION_DATABASE_URL:`postgres://synthetic_ingestion:${credentials.ingestion}@127.0.0.1:${port}/postgres`,RATE_LIMIT_HMAC_SECRET:secret,ALLOWED_ORIGINS:developmentOrigin});
const base={host:'127.0.0.1',port:5432,database:'postgres',ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:1000,statement_timeout:4000};
const observer=new pg.Client({...base,user:'synthetic_observer',password:credentials.observer,application_name:`campaign-${run}-http-observer`});observer.on('error',()=>{});
const hosts=new Set(),proxies=new Set();let stage='connect',failed=false;
const emit=test=>console.log(JSON.stringify({stage:'http-postgres',test,result:'PASS'}));
const key=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const payload={schemaVersion:1,fullName:'Synthetic QA',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic HTTP database enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'};
async function start({port=5432,authority=ca,driverOptions={},httpOptions={}}={}){
 const h=await startLocalPostgresEnquiry({developmentOptIn:true,scopedConfig:config(port),approvedTarget:{...target,ca:authority},driverOptions,httpOptions});hosts.add(h);assert.equal(h.address.address,'127.0.0.1');return h;
}
async function close(h){await h.close();hosts.delete(h);}
function send(h,n,{body=JSON.stringify(payload),stall=false}={}){
 return new Promise((resolve,reject)=>{
  const r=http.request({host:'127.0.0.1',port:h.address.port,path:'/enquiries',method:'POST',headers:{Origin:developmentOrigin,'Content-Type':'application/json','Idempotency-Key':key(n)}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',s=>{text+=s;if(text.length>4096)r.destroy(Error('RESPONSE_TOO_LARGE'));});res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text)});}catch{reject(Error('INVALID_RESPONSE'));}});res.on('error',reject);
  });r.on('error',reject);r.setTimeout(12000,()=>r.destroy(Error('HTTP_WATCHDOG')));if(stall){r.flushHeaders();r.write('{');}else r.end(body);
 });
}
async function counts(n){return (await observer.query('SELECT count(DISTINCT e.id)::int enquiries,count(DISTINCT e.lead_id)::int leads,count(DISTINCT o.id)::int outbox,min(e.id::text) receipt FROM operations.website_enquiries e LEFT JOIN operations.notification_outbox o ON o.enquiry_id=e.id WHERE e.idempotency_key=$1',[key(n)])).rows[0];}
async function resetRate(){await observer.query('TRUNCATE operations.rate_buckets');}
async function until(check){const end=Date.now()+3000;do{if(await check())return;await delay(20);}while(Date.now()<end);throw Error('OBSERVATION_DEADLINE');}
async function rates(){return (await observer.query('SELECT slot,used FROM operations.rate_buckets ORDER BY slot')).rows;}
try{
 await observer.connect();assert.equal((await observer.query('SHOW server_version_num')).rows[0].server_version_num.slice(0,2),'17');
 assert.deepEqual((await observer.query('SELECT version FROM operations.migration_versions ORDER BY version')).rows.map(x=>x.version),[1,2,3,4]);
 assert.equal((await observer.query('SELECT count(*)::int n FROM operations.website_enquiries')).rows[0].n,0);
 assert.equal((await observer.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
 emit('fresh 001-004 ledger, PostgreSQL 17 and verified observer TLS');
 stage='success';let h=await start();const first=await send(h,1);assert.equal(first.status,201);assert.equal(first.body.notification,'queued');
 assert.deepEqual(await counts(1),{enquiries:1,leads:1,outbox:1,receipt:first.body.enquiryId});
 assert.equal((await observer.query('SELECT state FROM operations.notification_outbox WHERE enquiry_id=$1',[first.body.enquiryId])).rows[0].state,'queued');
 const repeat=await send(h,1);assert.equal(repeat.status,200);assert.deepEqual(repeat.body,first.body);
 const overlap=await Promise.all([send(h,1),send(h,1)]);for(const r of overlap){assert.equal(r.status,200);assert.deepEqual(r.body,first.body);}
 assert.equal((await send(h,1,{body:JSON.stringify({...payload,fullName:'Different QA'})})).status,409);
 assert.equal((await counts(1)).enquiries,1);emit('HTTP 201, linked records, sequential/concurrent same-key replay and 409');
 const before=await rates();assert.equal(before.length,2);assert.ok(before.every(x=>x.used===5));await close(h);h=await start();
 assert.equal((await send(h,2)).status,429);const after=await rates();assert.deepEqual(after.map(x=>x.slot),before.map(x=>x.slot));assert.ok(after.every(x=>x.used===6));
 await close(h);emit('configured stable rate identity and durable denial across host/process restart');
 stage='rollback';await resetRate();
 await observer.query("CREATE FUNCTION public.http_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='synthetic rollback fixture'; END $$");
 await observer.query('CREATE TRIGGER http_test_fail AFTER INSERT ON operations.notification_outbox FOR EACH ROW EXECUTE FUNCTION public.http_test_fail()');
 h=await start();const totals=(await observer.query('SELECT (SELECT count(*) FROM operations.leads)::int leads,(SELECT count(*) FROM operations.website_enquiries)::int enquiries,(SELECT count(*) FROM operations.notification_outbox)::int outbox')).rows[0];
 assert.equal((await send(h,3)).status,503);assert.deepEqual(await counts(3),{enquiries:0,leads:0,outbox:0,receipt:null});
 assert.deepEqual((await observer.query('SELECT (SELECT count(*) FROM operations.leads)::int leads,(SELECT count(*) FROM operations.website_enquiries)::int enquiries,(SELECT count(*) FROM operations.notification_outbox)::int outbox')).rows[0],totals);
 assert.ok((await rates()).every(x=>x.used===1));await close(h);
 await observer.query('DROP TRIGGER http_test_fail ON operations.notification_outbox');await observer.query('DROP FUNCTION public.http_test_fail()');
 emit('third-insert SQL failure rolls back all records; independent limiter COMMIT persists');
 stage='denials';const login=new pg.Client({...base,user:'synthetic_ingestion',password:credentials.ingestion});login.on('error',()=>{});await login.connect();
 try{for(const sql of ['SELECT * FROM operations.leads','SELECT * FROM operations.website_enquiries','SELECT * FROM operations.notification_outbox','SELECT operations.claim_notification()',"CREATE ROLE forbidden_http_admin NOLOGIN"]){await assert.rejects(login.query(sql),e=>e.code==='42501');}}finally{await login.end();}
 emit('dedicated ingestion LOGIN denied private reads, notification execution and role creation');
 stage='limiter outage';await resetRate();await observer.query('REVOKE EXECUTE ON FUNCTION operations.consume_enquiry_limit(text) FROM ops_ingestion_api');h=await start();
 assert.equal((await send(h,4)).status,503);assert.equal((await counts(4)).enquiries,0);await close(h);await observer.query('GRANT EXECUTE ON FUNCTION operations.consume_enquiry_limit(text) TO ops_ingestion_api');emit('real limiter permission outage fails closed');
 stage='HTTP bounds';await resetRate();h=await start({httpOptions:{bodyDeadlineMs:50,requestDeadlineMs:500}});
 assert.equal((await send(h,5,{body:'x'.repeat(16385)})).status,422);assert.equal((await send(h,6,{stall:true})).status,408);assert.equal((await counts(5)).enquiries,0);await close(h);emit('real HTTP oversized request and stalled-body deadline');
 stage='pool';await resetRate();h=await start({driverOptions:{acquisitionMs:100,lockMs:1800,statementMs:2500,operationMs:3000},httpOptions:{bodyDeadlineMs:100,requestDeadlineMs:5000}});
 const holder=new pg.Client({...base,user:'synthetic_observer',password:credentials.observer,application_name:`campaign-${run}-http-holder`});holder.on('error',()=>{});await holder.connect();let pending=[];
 try{
  await holder.query('BEGIN');await holder.query('LOCK operations.rate_buckets IN ACCESS EXCLUSIVE MODE');const holderPid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  pending=Array.from({length:4},(_,i)=>send(h,20+i));
  await until(async()=>Number((await observer.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name='anabhay-operations' AND $1=ANY(pg_blocking_pids(pid))",[holderPid])).rows[0].n)===4);
  pending.push(...Array.from({length:5},(_,i)=>send(h,24+i)));
  const responses=await Promise.all(pending);assert.ok(responses.every(x=>x.status===503));
 }finally{await holder.query('ROLLBACK');await Promise.allSettled(pending);await holder.end();await close(h);}
 emit('four independently observed blocked pool sessions; admission/acquisition/lock deadlines return 503; shutdown completes');
 for(const [n,mode,port] of [[40,'before-server-commit',15432],[41,'after-server-commit',15433]]){
  stage=mode;await resetRate();const proxy=await createCommitFaultProxy({mode,port,skipCommits:1,emit:()=>{}});proxies.add(proxy);
  h=await start({port,authority:proxy.ca.toString(),driverOptions:{operationMs:1000},httpOptions:{bodyDeadlineMs:100,requestDeadlineMs:3000}});
  let settled=false;const result=send(h,n).then(x=>{settled=true;return x;});
  let phaseTimer;try{await Promise.race([proxy.phase,new Promise((_,reject)=>{phaseTimer=setTimeout(()=>reject(Error('PROXY_PHASE_TIMEOUT')),3000);})]);}finally{clearTimeout(phaseTimer);}
  const committed=await counts(n);assert.equal(committed.enquiries,mode==='after-server-commit'?1:0);assert.equal(settled,false);
  proxy.disconnect();assert.equal((await result).status,503);await close(h);await proxy.close();proxies.delete(proxy);
  await until(async()=>!(await observer.query("SELECT 1 FROM pg_stat_activity WHERE application_name='anabhay-operations'")).rowCount);
  h=await start();const recovery=await send(h,n);assert.equal(recovery.status,mode==='after-server-commit'?200:201);
  const saved=await counts(n);assert.deepEqual({leads:saved.leads,enquiries:saved.enquiries,outbox:saved.outbox},{leads:1,enquiries:1,outbox:1});
  if(mode==='after-server-commit')assert.equal(recovery.body.enquiryId,committed.receipt);await close(h);
  emit(`${mode}: genuine TLS COMMIT transport fault; observer distinguishes outcome; HTTP never falsely succeeds; same-key recovery`);
 }
 stage='cleanup';await until(async()=>!(await observer.query("SELECT 1 FROM pg_stat_activity WHERE application_name='anabhay-operations'")).rowCount);emit('all HTTP hosts shut down and driver backends disappeared');
}catch(error){failed=true;console.log(JSON.stringify({stage,result:'FAIL',code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:null,assertion:error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:null}));}
finally{for(const proxy of proxies)await proxy.close().catch(()=>{failed=true;});for(const h of hosts)await h.close().catch(()=>{failed=true;});await observer.end().catch(()=>{failed=true;});}
if(failed)process.exitCode=1;
