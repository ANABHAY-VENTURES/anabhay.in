import {createHash} from 'node:crypto';
export class ContentDenied extends Error{constructor(){super('Notification content unavailable.');}}
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
// Local authorization kernel for an ATOMIC trusted store adapter. No SQL/table
// reader is provided: current migrations lack this worker/team/snapshot binding.
// Never construct evidence from HTTP input or a caller-supplied team/identity.
export function authorizeNotificationContent({job,worker,row,serverNow}){
 const deny=()=>{throw new ContentDenied();};
 if(!job||!worker||!row||!uuid(job.id)||!uuid(job.leaseToken)||!uuid(job.enquiryId)||
  worker.active!==true||worker.capability!=='notification'||!uuid(worker.id)||
  !Array.isArray(worker.teamIds)||!worker.teamIds.every(uuid)||
  row.id!==job.id||row.enquiryId!==job.enquiryId||row.leaseToken!==job.leaseToken||
  row.workerId!==worker.id||row.state!=='processing'||row.teamActive!==true||
  !worker.teamIds.includes(row.teamId)||!Number.isFinite(serverNow)||!Number.isFinite(row.leaseUntil)||row.leaseUntil<=serverNow)deny();
 if(!row.snapshot||Object.keys(row.snapshot).sort().join(',')!=='destination,templateVersion,text'||
  Object.values(row.snapshot).some(v=>typeof v!=='string'||!v||v.includes('\0'))||
  row.snapshot.destination.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.snapshot.destination)||
  ! /^[a-zA-Z0-9_-]{1,40}$/.test(row.snapshot.templateVersion)||Buffer.byteLength(row.snapshot.text)>16384)deny();
 const snapshot=Object.freeze({destination:row.snapshot.destination,templateVersion:row.snapshot.templateVersion,text:row.snapshot.text});
 const digest=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 if(row.snapshotDigest!==digest)deny(); // Trusted immutable snapshot, not mutable live lead content.
 return Object.freeze({snapshot,digest,leaseRemainingMs:row.leaseUntil-serverNow});
}
