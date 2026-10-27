import test from 'node:test';
import assert from 'node:assert/strict';
import {startLocalPostgresEnquiry} from '../server/local-postgres-http.mjs';
import {developmentOrigin} from '../server/local-http.mjs';
// Rejection-only tests: every input fails before opening a pool or listener.
const target={expectedProjectRef:'aaaaaaaaaaaaaaaaaaaa',expectedDatabaseHost:'127.0.0.1',allowedOrigins:[developmentOrigin],ca:'-----BEGIN CERTIFICATE-----\nsynthetic placeholder, never used for TLS\n-----END CERTIFICATE-----'};
const config={OPERATIONS_PROJECT_REF:target.expectedProjectRef,OPERATIONS_INGESTION_DATABASE_URL:'postgres://synthetic_ingestion:synthetic-only@127.0.0.1:5432/postgres',RATE_LIMIT_HMAC_SECRET:'synthetic-local-test-rate-secret-32',ALLOWED_ORIGINS:developmentOrigin};
test('local PostgreSQL HTTP binding refuses missing opt-in, remote targets and origin changes',async()=>{
 await assert.rejects(startLocalPostgresEnquiry());
 for(const approvedTarget of [{...target,expectedDatabaseHost:'remote.invalid'},{...target,expectedProjectRef:'iaxkbwxzalmxnllfqgpr'},{...target,ca:undefined},{...target,allowedOrigins:['https://other.invalid']}]){
  await assert.rejects(startLocalPostgresEnquiry({developmentOptIn:true,scopedConfig:config,approvedTarget}));
 }
});
test('local PostgreSQL HTTP binding refuses credentials outside synthetic scope, unsafe HTTP options and short HMAC secret',async()=>{
 for(const patch of [{OPERATIONS_INGESTION_DATABASE_URL:'postgres://postgres:synthetic@127.0.0.1:5432/postgres'},{OPERATIONS_INGESTION_DATABASE_URL:'postgres://synthetic_ingestion:synthetic@remote.invalid:5432/postgres'},{OPERATIONS_INGESTION_DATABASE_URL:'postgres://synthetic_ingestion:synthetic@127.0.0.1:9999/postgres'},{RATE_LIMIT_HMAC_SECRET:'short'},{SUPABASE_SERVICE_ROLE_KEY:'synthetic-forbidden'}]){
  await assert.rejects(startLocalPostgresEnquiry({developmentOptIn:true,scopedConfig:{...config,...patch},approvedTarget:target}));
 }
 await assert.rejects(startLocalPostgresEnquiry({developmentOptIn:true,scopedConfig:config,approvedTarget:target,httpOptions:{host:'0.0.0.0'}}));
});
