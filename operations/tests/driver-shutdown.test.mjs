import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createIngestionDriver} from '../server/postgres.mjs';
const config={host:'test.example.invalid',expectedHost:'test.example.invalid',database:'synthetic',user:'synthetic_login',password:'synthetic-only',ssl:{rejectUnauthorized:true}};
function fixture(ms=1000){let resolve,reject,calls=0;const closure=new Promise((a,b)=>{resolve=a;reject=b;});
 class Pool extends EventEmitter{end(){calls++;return closure;}}
 return {driver:createIngestionDriver(config,{shutdownMs:ms},{Pool}),resolve,reject,calls:()=>calls};
}
test('delayed pool closure cannot resolve shutdown; concurrent and completed calls share promise',async()=>{
 const f=fixture();let completed=false;const p=f.driver.shutdown();p.then(()=>{completed=true;});
 assert.equal(f.driver.shutdown(),p);await new Promise(r=>setImmediate(r));assert.equal(completed,false);assert.equal(f.calls(),1);
 f.resolve();await p;assert.equal(completed,true);assert.equal(f.driver.shutdown(),p);
});
test('pool rejection returns cached sanitized unconfirmed failure',async()=>{
 const f=fixture(),p=f.driver.shutdown();f.reject(new Error('synthetic private error'));
 await assert.rejects(p,e=>e.outcome==='shutdown-unconfirmed'&&!e.message.includes('private'));
 assert.equal(f.driver.shutdown(),p);assert.equal(f.calls(),1);
});
test('deadline rejects; late settlement cannot turn cached failure into success',async()=>{
 const f=fixture(5),p=f.driver.shutdown();
 await assert.rejects(p,e=>e.outcome==='shutdown-unconfirmed');f.resolve();await new Promise(r=>setImmediate(r));
 assert.equal(f.driver.shutdown(),p);await assert.rejects(p);assert.equal(f.calls(),1);
 await assert.rejects(f.driver.consumeLimit('a'.repeat(64)));
});
test('late pool rejection after deadline remains observed',async()=>{
 const f=fixture(5),p=f.driver.shutdown();await assert.rejects(p);f.reject(new Error('synthetic late error'));
 await new Promise(r=>setImmediate(r));assert.equal(f.driver.shutdown(),p);
});
