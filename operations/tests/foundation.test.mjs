import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateRequest,reviewSubmission} from '../server/enquiry.mjs';
import {buildPages} from '../../scripts/build-pages.mjs';
const key='00000000-0000-4000-8000-000000000001';
const payload=()=>({schemaVersion:1,fullName:'QA Example',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'software-web',description:'synthetic test enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'});
const raw=()=>JSON.stringify(payload());
test('strict server validation normalizes payload and rejects unsafe shapes',()=>{
 assert.equal(validateRequest(raw(),key).payload.fullName,'QA Example');
 for(const input of ['null','[]','{',JSON.stringify({...payload(),role:'owner'}),JSON.stringify({...payload(),fullName:123}),JSON.stringify({...payload(),consent:false}),JSON.stringify({...payload(),schemaVersion:2}),JSON.stringify({...payload(),phone:{}}),'x'.repeat(16385)]) assert.throws(()=>validateRequest(input,key),e=>e.status===422);
 assert.throws(()=>validateRequest(raw(),'bad'),e=>e.status===422);
});
test('canonical hash is independent of JSON property order',()=>{
 const reversed=Object.fromEntries(Object.entries(payload()).reverse());
 assert.equal(validateRequest(raw(),key).hash,validateRequest(JSON.stringify(reversed),key).hash);
});
test('synthetic transactional adapter preserves retries and conflicting keys',async()=>{
 // In-memory fake only; not a concurrency or database transaction test.
 const records=new Map();let inserts=0;
 const persist=async r=>{const old=records.get(r.key);if(old)return old.hash===r.hash?{...old.receipt,replayed:true}:{conflict:true};const receipt={persisted:true,enquiryId:'synthetic-id',notification:'queued'};records.set(r.key,{hash:r.hash,receipt});inserts++;return receipt;};
 const deps={abuseCheck:async()=>true,persist};
 assert.equal((await reviewSubmission(raw(),key,deps)).status,201);
 assert.equal((await reviewSubmission(raw(),key,deps)).status,200);
 await assert.rejects(reviewSubmission(JSON.stringify({...payload(),fullName:'Other Example'}),key,deps),e=>e.status===409);
 assert.equal(inserts,1);
});
test('abuse denial prevents persistence and has 429 semantics',async()=>{
 let calls=0;await assert.rejects(reviewSubmission(raw(),key,{abuseCheck:async()=>false,persist:async()=>{calls++;}}),e=>e.status===429);assert.equal(calls,0);
});
test('failed or incomplete persistence returns safe 503 without raw error',async()=>{
 for(const persist of [async()=>({persisted:false}),async()=>{throw new Error('synthetic internal details');}]) await assert.rejects(reviewSubmission(raw(),key,{abuseCheck:async()=>true,persist}),e=>e.status===503 && !e.message.includes('internal'));
});
test('abuse service outage fails closed with safe 503',async()=>{
 let calls=0;
 await assert.rejects(reviewSubmission(raw(),key,{abuseCheck:async()=>{throw new Error('synthetic internal error');},persist:async()=>{calls++;}}),e=>e.status===503 && !e.message.includes('internal'));
 assert.equal(calls,0);
});
test('staff SQL guardrails include inactive and assignment/team restrictions',()=>{
 const sql=readFileSync(new URL('../migrations/001_staff_crm.sql',import.meta.url),'utf8');
 for(const table of ['teams','employees','team_memberships','leads','lead_assignments','lead_activities']) assert.ok(sql.includes(`alter table operations.${table} enable row level security;`));
 assert.match(sql,/e\.state='active'/);
 assert.match(sql,/e\.role='member' and assigned_to=e\.id/);
 assert.match(sql,/e\.role='manager'/);
 assert.match(sql,/m\.team_id=leads\.team_id and t\.active/);
 assert.doesNotMatch(sql,/for (insert|update|delete)/i);
 // Static assertions only, not an RLS execution test.
});
test('SQL draft denies broad server writes and confines definer ingestion to narrow owner',()=>{
 for(const file of ['001_staff_crm.sql','002_ingestion_outbox.sql']){
  const sql=readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8');
  assert.match(sql,/NOT EXECUTED/);
  assert.doesNotMatch(sql,/create\s+(?:or\s+replace\s+)?function/i);
  assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|all).*to\s+(?:anon|authenticated|public)/i);
 }
 const ingestion=readFileSync(new URL('../migrations/003_atomic_ingestion.sql',import.meta.url),'utf8');
 assert.match(ingestion,/security definer set search_path = ''/);
 assert.match(ingestion,/owner to ops_ingest_executor/);
 assert.match(ingestion,/to ops_ingestion_api/);
 assert.doesNotMatch(ingestion,/to service_role;/);
 assert.match(ingestion,/revoke all on function .* from public,anon,authenticated,service_role/);
 assert.match(ingestion,/revoke create on schema operations from ops_ingest_executor/);
 assert.match(ingestion,/pg_advisory_xact_lock/);
});
test('public artifact excludes backend, migrations, fixtures and config examples',()=>{
 const temp=mkdtempSync(join(tmpdir(),'anabhay-public-qa-'));
 try{
  const dest=join(temp,'artifact');buildPages(dest);
  const names=readdirSync(dest);
  for(const n of ['operations','scripts','docs','.env.example','.github'])assert.ok(!names.includes(n));
  assert.ok(names.includes('CNAME'));assert.ok(names.includes('contact'));
  assert.throws(()=>buildPages(dest),/must not exist/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
