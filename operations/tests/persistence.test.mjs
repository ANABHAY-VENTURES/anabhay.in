import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/005_notification_persistence.sql',import.meta.url),'utf8');
test('persistence proposal adds no worker authorization or elevated helper',()=>{
 assert.doesNotMatch(sql,/grant\s|create\s+role|security\s+definer|bypassrls|create or replace|if exists|cascade/i);
 assert.doesNotMatch(sql,/alter table operations\.notification_outbox/i);
 for(const t of ['notification_snapshots','notification_attempts','notification_observations','notification_holds']){
  assert.ok(sql.includes(`alter table operations.${t} force row level security`));
 }
});
test('persistence proposal preserves original queue/identity and schema version gate',()=>{
 assert.match(sql,/ARRAY\[1,2,3,4\]/);assert.match(sql,/values\(5,'notification-persistence'\)/);
 assert.match(sql,/on delete restrict/);assert.match(sql,/primary key\(outbox_id,attempt\)/);
 assert.match(sql,/snapshot_immutable/);assert.match(sql,/observation_immutable/);
});
