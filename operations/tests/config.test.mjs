import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {validateProcessConfig} from '../server/config.mjs';
import {createIngestionDriver,createNotificationDriver} from '../server/postgres.mjs';
import {createIngestionProcess,createNotificationProcess} from '../server/process-runtime.mjs';
const ref='aaaaaaaaaaaaaaaaaaaa',target={expectedProjectRef:ref,expectedDatabaseHost:'db.test.example.invalid',allowedOrigins:['https://qa.example.invalid']};
const ingestion={OPERATIONS_PROJECT_REF:ref,OPERATIONS_INGESTION_DATABASE_URL:'postgresql://synthetic_ingest:synthetic-only@db.test.example.invalid/synthetic',RATE_LIMIT_HMAC_SECRET:'x'.repeat(32),ALLOWED_ORIGINS:'https://qa.example.invalid'};
const notification={OPERATIONS_PROJECT_REF:ref,OPERATIONS_NOTIFICATION_DATABASE_URL:'postgresql://synthetic_worker:synthetic-only@db.test.example.invalid/synthetic'};
test('scoped startup config produces separate verified-TLS database configurations',()=>{
 const a=validateProcessConfig('ingestion',ingestion,target),b=validateProcessConfig('notification',notification,target);
 assert.equal(a.database.ssl.rejectUnauthorized,true);assert.equal(b.database.user,'synthetic_worker');
 assert.equal(b.rateLimitSecret,undefined);assert.equal(a.database.host,target.expectedDatabaseHost);
});
test('missing, mixed, privileged, target-mismatched or contradictory config fails closed without values',()=>{
 for(const e of [{...ingestion,OPERATIONS_NOTIFICATION_DATABASE_URL:notification.OPERATIONS_NOTIFICATION_DATABASE_URL},{...ingestion,SUPABASE_SERVICE_ROLE_KEY:'synthetic-sensitive'},{...ingestion,RATE_LIMIT_HMAC_SECRET:''},{...ingestion,OPERATIONS_PROJECT_REF:'b'.repeat(20)},{...ingestion,ALLOWED_ORIGINS:'https://other.example.invalid'},{...ingestion,OPERATIONS_INGESTION_DATABASE_URL:ingestion.OPERATIONS_INGESTION_DATABASE_URL+'?sslmode=no-verify'},{...ingestion,OPERATIONS_INGESTION_DATABASE_URL:ingestion.OPERATIONS_INGESTION_DATABASE_URL.replace('synthetic_ingest','postgres')},{...ingestion,OPERATIONS_INGESTION_DATABASE_URL:ingestion.OPERATIONS_INGESTION_DATABASE_URL.replace('db.test','other.test')}]){
  assert.throws(()=>validateProcessConfig('ingestion',e,target),e=>e.message==='Operations configuration unavailable.');
 }
});
test('public and staff config accept public key only; live provider/admin loading disabled',()=>{
 const e={OPERATIONS_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'x'.repeat(20)};
 for(const role of ['public','staff'])assert.equal(validateProcessConfig(role,e,target).url,e.SUPABASE_URL);
 for(const key of ['sb_secret_'+'x'.repeat(20),'legacy-admin-jwt'])assert.throws(()=>validateProcessConfig('public',{...e,SUPABASE_PUBLISHABLE_KEY:key},target));
 assert.throws(()=>validateProcessConfig('public',{...e,EMAIL_API_KEY:'synthetic-only'},target));
 assert.throws(()=>validateProcessConfig('provider',{OPERATIONS_PROJECT_REF:ref,EMAIL_API_KEY:'synthetic-only',NOTIFICATION_FROM:'qa@example.invalid',NOTIFICATION_TO:'qa@example.invalid'},target));
 assert.throws(()=>validateProcessConfig('migration',{OPERATIONS_PROJECT_REF:ref,OPERATIONS_MIGRATION_DATABASE_URL:'synthetic-only'},target));
});
test('process driver factories create exactly one pool and expose only intended methods',async()=>{
 const pools=[];class Pool extends EventEmitter{constructor(c){super();pools.push(c);}async end(){}}
 const a=createIngestionDriver(validateProcessConfig('ingestion',ingestion,target).database,{}, {Pool});
 assert.deepEqual(Object.keys(a).sort(),['consumeLimit','ingestEnquiry','reconcileEnquiry','shutdown']);assert.equal(pools.length,1);
 const b=createNotificationDriver(validateProcessConfig('notification',notification,target).database,{}, {Pool});
 assert.deepEqual(Object.keys(b).sort(),['acceptNotification','claimNotification','retryNotification','shutdown']);assert.equal(pools.length,2);
 assert.throws(()=>createIngestionDriver({}, {notification:{}},{Pool}));await a.shutdown();await b.shutdown();
});
test('startup entry validates before pools and never returns secret configuration',async()=>{
 let pools=0;class Pool extends EventEmitter{constructor(){super();pools++;}async end(){}}
 assert.throws(()=>createIngestionProcess({...ingestion,EMAIL_API_KEY:'synthetic-only'},target,{}, {Pool}));assert.equal(pools,0);
 const a=createIngestionProcess(ingestion,target,{}, {Pool});const b=createNotificationProcess(notification,target,{}, {Pool});
 assert.equal(pools,2);assert.deepEqual(Object.keys(a),['capabilities','shutdown']);
 assert.deepEqual(Object.keys(a.capabilities).sort(),['abuseCheck','persist']);assert.equal(b.consumeLimit,undefined);
 assert.ok(!JSON.stringify([a,b]).includes('synthetic-only'));await a.shutdown();await b.shutdown();
});
