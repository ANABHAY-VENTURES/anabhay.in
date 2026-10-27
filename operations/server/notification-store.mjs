import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {providerOutcome} from './provider.mjs';
import {WorkerUnavailable} from './notification-worker.mjs';
// Trusted named-capability adapter only; no SQL, pool, role or credentials exposed.
export function createPostgresNotificationStore(driver){
 if(!driver||['claim','readContent','recordAttempt','recordObservation','finish','status','shutdown'].some(k=>typeof driver[k]!=='function'))throw new WorkerUnavailable();
 return Object.freeze({
  claim:options=>driver.claim(options),
  readContent:async(job,options)=>{
   const started=performance.now();
   const r=await driver.readContent(job,options);
   if(!r?.snapshot||Object.keys(r.snapshot).sort().join(',')!=='destination,templateVersion,text')throw new WorkerUnavailable();
   const snapshot=Object.freeze({destination:r.snapshot.destination,templateVersion:r.snapshot.templateVersion,text:r.snapshot.text});
   if(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')!==r.digest||!Number.isFinite(r.leaseRemainingMs)||r.leaseRemainingMs<=0)throw new WorkerUnavailable();
   const known=r.knownAcceptance?providerOutcome(r.knownAcceptance):null;
   if(known&&!known.messageId)throw new WorkerUnavailable();
   // Subtract whole RPC latency conservatively; COMMIT acknowledgement delay is
   // not remaining lease time. Server token checks remain authoritative.
   return Object.freeze({snapshot,digest:r.digest,leaseRemainingMs:r.leaseRemainingMs-(performance.now()-started),knownAcceptance:known});
  },
  recordAttempt:(job,record,options)=>driver.recordAttempt(job,record,options),
  recordObservation:(job,record,options)=>driver.recordObservation(job,record,options),
  accept:(job,id,options)=>driver.finish(job,'accept',id,options),
  retry:(job,code,options)=>driver.finish(job,'retry',code,options),
  quarantine:(job,code,options)=>driver.finish(job,'hold',code,options),
  status:(job,options)=>driver.status(job.id,job.enquiryId,options),
  shutdown:()=>driver.shutdown()
 });
}
