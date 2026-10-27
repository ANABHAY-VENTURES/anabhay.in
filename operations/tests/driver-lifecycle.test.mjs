import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPostgresDriver} from '../server/postgres.mjs';

const config={host:'test.example.invalid',expectedHost:'test.example.invalid',database:'synthetic',user:'synthetic_login',password:'synthetic-only',ssl:{rejectUnauthorized:true},max:1};
function fixture(phase,endFailure=false){
 const pools=[];let ends=0;
 class Pool extends EventEmitter{
  constructor(){super();pools.push(this);}
  async connect(){
   if(!this.client){
    const c=this.client=new EventEmitter();c.checkouts=0;
    c.query=async sql=>{
     if(phase==='destruction'&&sql.includes('consume_enquiry_limit'))throw new Error('synthetic query failure');
     if((phase==='query'&&sql.includes('consume_enquiry_limit'))||(phase==='commit'&&sql==='COMMIT'))c.emit('error',new Error('synthetic private detail'));
     if(sql.startsWith('SELECT current_user'))return {rows:[{privileged:false,extra:false,capability:true}]};
     if(sql.includes('consume_enquiry_limit'))return {rows:[{allowed:true}]};
     return {rows:[],command:sql==='COMMIT'?'COMMIT':undefined};
    };
    c.release=destroy=>{
     if(phase==='release'||phase==='destruction')c.emit('error',new Error('synthetic private detail'));
     if(destroy)c.emit('end');
    };
    this.emit('connect',c);
   }
   const c=this.client;c.checkouts++;
   if(phase==='checkout'||(phase==='recheckout'&&c.checkouts===2))c.emit('error',new Error('synthetic private detail'));
   return c;
  }
  async end(){ends++;if(endFailure==='pending')return new Promise(()=>{});if(endFailure)throw new Error('synthetic private detail');await new Promise(r=>setTimeout(r,5));this.client?.emit('end');}
 }
 const driver=createPostgresDriver({ingestion:config,notification:{...config,user:'synthetic_worker'},shutdownMs:20},{Pool});
 return {driver,pools,ends:()=>ends};
}
for(const phase of ['checkout','recheckout','query','commit','release','destruction'])test(`mock physical error listener: ${phase}`,async()=>{
 const f=fixture(phase);const operation=()=>f.driver.consumeLimit('a'.repeat(64));
 if(phase==='recheckout')assert.equal(await operation(),true);
 if(phase==='release'){
  assert.equal(await operation(),true); // COMMIT acknowledged before release error.
  await assert.rejects(operation(),e=>e.outcome==='not-committed');
 }else await assert.rejects(operation(),e=>e.outcome===(phase==='commit'?'unknown':'not-committed'));
 const c=f.pools[0].client;
 if(phase==='destruction')assert.equal(c.listenerCount('error'),0);
 else assert.ok(c.listenerCount('error')<=1);
 await f.driver.shutdown();assert.equal(c.listenerCount('error'),0);
});
test('shutdown shares exact promise concurrently and after completion; denies new work',async()=>{
 const f=fixture();const a=f.driver.shutdown(),b=f.driver.shutdown();assert.equal(a,b);
 await assert.rejects(f.driver.consumeLimit('a'.repeat(64)));await a;
 assert.equal(f.driver.shutdown(),a);assert.equal(f.ends(),2);
});
test('shutdown failure is sanitized, cached and never retries pool.end',async()=>{
 const f=fixture(undefined,true);const a=f.driver.shutdown();assert.equal(f.driver.shutdown(),a);
 await assert.rejects(a,e=>e.status===503&&!e.message.includes('private'));
 assert.equal(f.driver.shutdown(),a);await assert.rejects(a);assert.equal(f.ends(),2);
});
test('shutdown deadline is bounded and its settled promise is retained without claiming termination',async()=>{
 const f=fixture(undefined,'pending');const start=performance.now(),a=f.driver.shutdown();
 await assert.rejects(a,e=>e.status===503);assert.ok(performance.now()-start<1000);assert.equal(f.driver.shutdown(),a);
 assert.equal(f.ends(),2);await assert.rejects(f.driver.consumeLimit('a'.repeat(64)));
 // Mock pool.end remains unresolved: bounded shutdown is not proof of termination.
});
