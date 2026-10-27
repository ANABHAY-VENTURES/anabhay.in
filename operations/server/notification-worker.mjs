import {performance} from 'node:perf_hooks';
import {assertRecoveryProvider,providerOutcome,reconciliationAction} from './provider.mjs';
export class WorkerUnavailable extends Error{constructor(){super('Notification worker unavailable.');}}
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
// Executable local orchestration over a trusted committed store capability.
// PostgreSQL binding is explicit; only the deterministic fake provider is allowed.
export function createNotificationWorker({store,provider,namespace,concurrency=1,operationMs=5000,shutdownMs=6000,leaseMarginMs=30000}){
 const required=['claim','readContent','recordAttempt','recordObservation','accept','retry','quarantine','shutdown'];
 if(!store||required.some(k=>typeof store[k]!=='function')||! /^[a-z0-9-]{1,40}$/.test(namespace??'')||
  !Number.isInteger(concurrency)||concurrency<1||concurrency>4||
  !Number.isInteger(operationMs)||operationMs<1||operationMs>60000||
  !Number.isInteger(shutdownMs)||shutdownMs<1||shutdownMs>10000||
  !Number.isInteger(leaseMarginMs)||leaseMarginMs<1||leaseMarginMs>60000)throw new WorkerUnavailable();
 assertRecoveryProvider(provider);
 let closing=false,halted=false,shutdownPromise;const jobs=new Set(),outstanding=new Set(),controllers=new Set();
 function observe(p){const tracked=Promise.resolve(p);outstanding.add(tracked);tracked.then(()=>outstanding.delete(tracked),()=>outstanding.delete(tracked));return tracked;}
 async function execute(){
  const controller=new AbortController();controllers.add(controller);const deadline=performance.now()+operationMs;
  const call=async operation=>{
   if(controller.signal.aborted||performance.now()>=deadline)throw new WorkerUnavailable();
   const p=observe(Promise.resolve().then(()=>operation(controller.signal)));let timer;
   try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>{halted=true;controller.abort();reject(new WorkerUnavailable());},Math.max(1,deadline-performance.now()));})]);}
   finally{clearTimeout(timer);}
  };
  let job,key;
  try{
   job=await call(signal=>store.claim({signal}));if(!job)return {status:'idle'};
   if(!uuid(job.id)||!uuid(job.enquiryId)||!uuid(job.leaseToken)||!Number.isInteger(job.attempt)||job.attempt<1||job.attempt>10)throw new WorkerUnavailable();
   key=`${namespace}:${job.id}`;
   const content=await call(signal=>store.readContent(job,{signal}));
   if(!content||! /^[a-f0-9]{64}$/.test(content.digest??'')||
    !Number.isFinite(content.leaseRemainingMs)||content.leaseRemainingMs<operationMs+leaseMarginMs)throw new WorkerUnavailable();
   // Commit a possible-attempt marker BEFORE any external effect, fenced by lease.
   await call(signal=>store.recordAttempt(job,{key,digest:content.digest},{signal}));
   const lookup=content.knownAcceptance?providerOutcome(content.knownAcceptance):providerOutcome(await call(signal=>provider.lookup(key,{signal})));
   let action=reconciliationAction(lookup),outcome=lookup;
   if(action.action==='hold'){
    await call(signal=>store.quarantine(job,'provider-unknown',{signal}));return {status:'held'};
   }
   if(action.action==='send'){
    // Store revalidates active worker/team/token and immutable snapshot immediately
    // before sending. Lease time is reduced by elapsed processing, not reset locally.
    const fresh=await call(signal=>store.readContent(job,{signal}));
    if(fresh.digest!==content.digest||fresh.leaseRemainingMs<Math.max(0,deadline-performance.now())+leaseMarginMs)throw new WorkerUnavailable();
    try{outcome=providerOutcome(await call(signal=>provider.send({key,digest:content.digest,content:fresh.snapshot,signal})));}
    catch{return {status:'unknown'};} // marker stays durable; no automatic resend/retry.
    action=reconciliationAction(outcome);
   }
   await call(signal=>store.recordObservation(job,{key,digest:content.digest,...outcome},{signal}));
   if(action.action==='accept'){
    await call(signal=>store.accept(job,outcome.messageId,{signal}));
    return {status:'accepted',providerState:outcome.status}; // never claims delivery.
   }
   if(['rejected','rate-limited','retryable'].includes(outcome.status)){
    await call(signal=>store.retry(job,outcome.status==='rejected'?'provider-rejected':'unavailable',{signal}));return {status:'retry-scheduled'};
   }
   await call(signal=>store.quarantine(job,'provider-unknown',{signal}));return {status:'held'};
  }catch{return {status:'unknown'};}
  finally{controllers.delete(controller);}
 }
 return Object.freeze({
  runOnce(){
   if(closing)return Promise.reject(new WorkerUnavailable());
   // Timed-out operations still occupy capacity; a caller deadline is not cancellation.
   if(halted||jobs.size>=concurrency)return Promise.resolve({status:'busy'});
   const p=execute();jobs.add(p);p.then(()=>jobs.delete(p),()=>jobs.delete(p));return p;
  },
  shutdown(){
   if(shutdownPromise)return shutdownPromise;closing=true;
   shutdownPromise=(async()=>{
    for(const c of controllers)c.abort();let timer;
    const closed=observe(Promise.resolve().then(()=>store.shutdown()));
    try{
     await Promise.race([Promise.allSettled([...jobs,...outstanding,closed]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new WorkerUnavailable()),shutdownMs);})]);
     if(outstanding.size||(await closed.catch(()=>false))===false)throw new WorkerUnavailable();
    }catch{throw new WorkerUnavailable();}finally{clearTimeout(timer);}
   })();return shutdownPromise;
  }
 });
}
