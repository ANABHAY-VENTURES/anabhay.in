import {normalizeReleaseReason} from './release-reason.mjs';
import {createHmac} from 'node:crypto';
import {ApiError,reviewSubmission} from './enquiry.mjs';
import {withDeadline} from './deadline.mjs';
// queryCommitted is a trusted driver boundary: fixed SQL + bound parameters,
// READ COMMITTED, separate COMMITTED calls, no user-selected role or function.
export function enquiryCapabilities(queryCommitted,{queryDeadlineMs=5000}={}) {
 const query=(sql,args)=>withDeadline(signal=>queryCommitted(sql,args,{signal}),queryDeadlineMs);
 return {
  abuseCheck:async fingerprint=>{
   const allowed=await query('select operations.consume_enquiry_limit($1) as allowed',[fingerprint]);
   if(typeof allowed?.allowed!=='boolean') throw new ApiError(503,'Service unavailable.');
   return allowed.allowed;
  },
  persist:async ({key,hash,payload})=>{
   const result=await query('select operations.ingest_enquiry($1,$2,$3::jsonb) as receipt',[key,hash,JSON.stringify(payload)]);
   return result?.receipt;
  }
 };
}
// Concrete driver integration retains the existing abuseCheck/persist shape.
export function postgresEnquiryCapabilities(driver) {
 return {abuseCheck:fingerprint=>driver.consumeLimit(fingerprint),persist:request=>driver.ingestEnquiry(request)};
}
export function requestFingerprint(trustedNetworkIdentity,secret) {
 // Network identity MUST be provided by verified runtime connection metadata,
 // never body/header values, including untrusted X-Forwarded-For.
 if(typeof trustedNetworkIdentity!=='string'||!trustedNetworkIdentity||trustedNetworkIdentity.length>200||typeof secret!=='string'||secret.length<32) throw new ApiError(503,'Service unavailable.');
 return createHmac('sha256',secret).update(trustedNetworkIdentity).digest('hex');
}
export async function recordNote(input,{verifiedUserClient}) {
 if(!input||Object.keys(input).sort().join(',')!=='body,leadId'||typeof input.body!=='string'||input.body.trim().length<1||input.body.trim().length>2000||typeof input.leadId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.leadId)) throw new ApiError(422,'Invalid note.');
 try {
  // Supabase getUser verifies with Auth; getSession alone is not authorization.
  const {data,error}=await verifiedUserClient.auth.getUser();
  if(error||!data?.user?.id) throw new ApiError(403,'Access denied.');
  // This client MUST retain that same user's JWT; never service_role credentials.
  const result=await verifiedUserClient.schema('operations').rpc('record_lead_note',{p_lead:input.leadId,p_body:input.body.trim()});
  if(result.error||!result.data) throw new ApiError(403,'Access denied.');
  return {recorded:true};
 } catch {throw new ApiError(403,'Access denied.');}
}
export async function confirmProviderAcceptance(job,response,{verifyProviderReceipt,acceptCommitted}) {
 // Only trusted worker integration supplies these dependencies. No public handler.
 try {
 const confirmed=await verifyProviderReceipt(response,job);
 if(confirmed?.accepted!==true||typeof confirmed.messageId!=='string'||!confirmed.messageId.trim()||confirmed.messageId.length>200) throw new ApiError(503,'Notification acceptance unconfirmed.');
 await acceptCommitted(job.id,job.leaseToken,confirmed.messageId);
 return {accepted:true}; // provider acceptance, never proof of delivery.
 } catch {throw new ApiError(503,'Notification status unconfirmed.');}
}
export {reviewSubmission};

// Staff JWT only. Existing DB manager/team policy, not UI role labels, authorizes
// this operation. Worker/ingestion/admin clients must never be supplied here.
export async function releaseNotificationHold(input,{verifiedUserClient}){
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 if(!input||Object.keys(input).sort().join(',')!=='outboxId,reason,requestId'||!uuid(input.outboxId)||!uuid(input.requestId)||normalizeReleaseReason(input.reason)===null)throw new ApiError(422,'Invalid release.');
 try{
  const {data,error}=await verifiedUserClient.auth.getUser();if(error||!data?.user?.id)throw new Error();
 }catch{throw new ApiError(403,'Release access denied.');}
 try{
  const result=await verifiedUserClient.schema('operations').rpc('release_notification_hold',{p_id:input.outboxId,p_request:input.requestId,p_reason:normalizeReleaseReason(input.reason)});
  if(result.error){if(['42501','P0001'].includes(result.error.code))throw new ApiError(403,'Release access denied.');throw new Error();}
  return {released:true};
 }catch(e){if(e instanceof ApiError)throw e;throw new ApiError(503,'Release outcome unconfirmed. Retry with the same request identifier.');}
}
