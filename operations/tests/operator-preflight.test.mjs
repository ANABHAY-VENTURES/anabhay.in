import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectOperatorReadiness} from '../server/operator-preflight.mjs';

test('source preflight reports evidence without asserting database or activation readiness',()=>{
 const result=inspectOperatorReadiness();
 assert.equal(result.migrations.length,7);
 assert.ok(Object.values(result.checks).every(Boolean));
 assert.equal(result.activationAllowed,false);
 assert.equal(result.databaseReadiness,'NOT VERIFIED');
 assert.match(result.provisioning,/BLOCKED/);
 assert.ok(result.migrations.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
});
test('missing source fails closed without revealing exception details',()=>{
 assert.throws(()=>inspectOperatorReadiness(()=>''),/Local migration unavailable/);
});
test('absent source guards are not represented as passing',()=>{
 const result=inspectOperatorReadiness(()=> '-- synthetic missing guards');
 assert.ok(Object.values(result.checks).every(v=>v===false));
 assert.equal(result.activationAllowed,false);
});
