import {createHash} from 'node:crypto';
import {authorizeNotificationContent,ContentDenied} from '../../server/notification-content.mjs';
// In-memory MOCK store; records survive worker instance replacement only while
// this test object remains alive. Not a durable DB implementation or RLS proof.
export function createMockNotificationStore({active=true,capability='notification',team='20000000-0000-4000-8000-000000000001',hooks={}}={}){
 const worker={id:'10000000-0000-4000-8000-000000000001',active,capability,teamIds:[team]};
 const snapshot={destination:'qa@example.invalid',templateVersion:'synthetic-v1',text:'synthetic test notification'};
 const row={id:'30000000-0000-4000-8000-000000000001',enquiryId:'40000000-0000-4000-8000-000000000001',workerId:worker.id,teamId:team,teamActive:true,state:'queued',attempts:0,nextAttempt:0,snapshot,snapshotDigest:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')};
 const metadata=[];let token=0,time=0;
 const guard=job=>{if(row.id!==job.id||row.enquiryId!==job.enquiryId||row.state!=='processing'||row.leaseToken!==job.leaseToken||row.leaseUntil<=time||row.workerId!==worker.id||!row.teamActive||!worker.active||worker.capability!=='notification'||!worker.teamIds.includes(row.teamId))throw new ContentDenied();};
 const store={
  async claim(){if(hooks.claim)await hooks.claim();if(!worker.active||worker.capability!=='notification')throw new ContentDenied();if(['accepted','quarantined','failed'].includes(row.state))return null;if(row.attempts>=10){if(row.state==='processing'&&row.leaseUntil<=time){row.state='failed';row.leaseToken=null;row.leaseUntil=null;}return null;}if((row.state==='processing'&&row.leaseUntil>time)||row.nextAttempt>time)return null;
   row.state='processing';row.attempts++;row.leaseUntil=time+120000;row.leaseToken=`50000000-0000-4000-8000-${String(++token).padStart(12,'0')}`;return {id:row.id,enquiryId:row.enquiryId,leaseToken:row.leaseToken,attempt:row.attempts};},
  async readContent(job){return authorizeNotificationContent({job,worker,row,serverNow:time});},
  async recordAttempt(job,record){guard(job);if(row.key&&(row.key!==record.key||row.digest!==record.digest))throw new ContentDenied();row.key=record.key;row.digest=record.digest;metadata.push({kind:'attempt',...record});},
  async recordObservation(job,record){guard(job);metadata.push({kind:'observation',...record});},
  async accept(job,id){guard(job);if(hooks.beforeAccept)await hooks.beforeAccept();row.state='accepted';row.messageId=id;row.leaseToken=null;row.leaseUntil=null;if(hooks.afterAccept)await hooks.afterAccept();},
  async retry(job,code){guard(job);row.state=row.attempts===10?'failed':'queued';row.nextAttempt=time+300000;row.leaseToken=null;row.leaseUntil=null;row.errorCode=code;},
  async quarantine(job,code){guard(job);row.state='quarantined';row.errorCode=code;row.leaseToken=null;row.leaseUntil=null;},
  async shutdown(){if(hooks.shutdown)await hooks.shutdown();}
 };
 return {store,row,worker,metadata,advance:ms=>{time+=ms;}};
}
